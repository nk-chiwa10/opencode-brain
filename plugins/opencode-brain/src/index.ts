import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Plugin } from '@opencode/plugin';

const DEFAULT_BASE = 'http://127.0.0.1:3001';
const MEMORY_TYPES = ['conversation', 'decision', 'project-context', 'mistake', 'lesson', 'note'] as const;

const CAPTURE_INSTRUCTION = [
  'OpenCode Brain is available through the brain_* tools.',
  'When the user makes a decision, learns a lesson, hits a mistake, or shares durable project context,',
  'save it with brain_save_memory. First call brain_search to check for an existing similar memory.',
  'Use brain_link_memories to connect related memories. The save tool asks for approval before writing.',
  'Do not save trivial chatter, temporary debugging output, or anything the user has not said is worth keeping.',
].join(' ');

export default Plugin.define({
  id: 'opencode-brain',
  async setup(ctx) {
    const base = String(ctx.options.baseUrl ?? process.env.OPENCODE_BRAIN_URL ?? DEFAULT_BASE)
      .replace(/\/+$/, '');
    const brainRoot = String(ctx.options.brainRoot ?? 'C:/Users/mcmadueno/opencode-brain');
    const autoStart = ctx.options.autoStart !== false;

    let starting: Promise<void> | undefined;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    async function healthy(): Promise<boolean> {
      try {
        const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) });
        return res.ok;
      } catch {
        return false;
      }
    }

    async function ensureServer(): Promise<void> {
      if (await healthy()) return;
      if (!autoStart) {
        throw new Error(
          `OpenCode Brain is not running at ${base}. Start it with "npm run dev" in ${brainRoot}.`,
        );
      }
      if (!starting) {
        starting = (async () => {
          const entry = path.join(brainRoot, 'dist', 'server', 'index.js');
          if (!fs.existsSync(entry)) {
            throw new Error(
              `OpenCode Brain server build is missing at ${entry}. Run "npm run build" in ${brainRoot}.`,
            );
          }
          const child = spawn(process.execPath, [entry], {
            cwd: brainRoot,
            detached: true,
            stdio: 'ignore',
          });
          child.unref();
          for (let attempt = 0; attempt < 25; attempt += 1) {
            await wait(250);
            if (await healthy()) return;
          }
          throw new Error(`OpenCode Brain did not start at ${base}. Start it manually and try again.`);
        })().finally(() => {
          starting = undefined;
        });
      }
      await starting;
    }

    async function api<T>(requestPath: string, init?: RequestInit): Promise<T> {
      await ensureServer();
      const response = await fetch(`${base}${requestPath}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error ?? `Brain API error (${response.status})`);
      }
      return response.json() as Promise<T>;
    }

    type BrainEntity = { id: string; name: string; type: string };
    type BrainMemory = { id: string; title: string; type: string; content: string };

    async function resolveEntities(names: string[]): Promise<string[]> {
      if (!names.length) return [];
      const entities = await api<BrainEntity[]>('/api/entities');
      const ids: string[] = [];
      for (const raw of names) {
        const name = raw.trim();
        if (!name) continue;
        const found = entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (found) {
          ids.push(found.id);
          continue;
        }
        const created = await api<BrainEntity>('/api/entities', {
          method: 'POST',
          body: JSON.stringify({ name, type: 'concept', description: 'Created by OpenCode plugin.' }),
        });
        ids.push(created.id);
        entities.push(created);
      }
      return ids;
    }

    function findMemory(memories: BrainMemory[], text: string): BrainMemory | undefined {
      const query = text.trim().toLowerCase();
      return memories.find((m) => m.title.toLowerCase() === query)
        ?? memories.find((m) => m.title.toLowerCase().includes(query));
    }

    await ctx.session.hook('context', (event) => {
      event.system.push({ type: 'text', text: CAPTURE_INSTRUCTION });
    });

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: 'brain',
        description: 'OpenCode Brain: persistent memories and the knowledge graph.',
      });

      editor.add({
        name: 'save_memory',
        description:
          'Save a durable memory (decision, lesson, mistake, conversation or project context) to OpenCode Brain. Asks for approval before writing. Checks for duplicates on request.',
        input: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short, specific title.' },
            content: { type: 'string', description: 'The memory itself, with enough detail to be useful later.' },
            type: { type: 'string', enum: [...MEMORY_TYPES], description: 'Kind of memory.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Short topic tags.' },
            source: { type: 'string', description: 'Optional origin, e.g. a session or file.' },
            entityNames: {
              type: 'array',
              items: { type: 'string' },
              description: 'People, projects or technologies this memory relates to. Missing ones are created.',
            },
          },
          required: ['title', 'content'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          const data = input as {
            title: string;
            content: string;
            type?: string;
            tags?: string[];
            source?: string;
            entityNames?: string[];
          };

          await ctx.permission.assert({
            sessionID: context.sessionID,
            ...(context.agent ? { agent: context.agent } : {}),
            source: { type: 'tool', messageID: context.messageID, id: context.id },
            action: 'brain.save',
            resources: [data.title],
            save: ['brain.save:*'],
          });

          const entityIds = await resolveEntities(data.entityNames ?? []);
          const memory = await api<BrainMemory>('/api/memories', {
            method: 'POST',
            body: JSON.stringify({
              type: data.type ?? 'lesson',
              title: data.title,
              content: data.content,
              tags: data.tags ?? [],
              source: data.source ?? 'OpenCode session',
              entityIds,
            }),
          });
          return {
            content: `Saved memory "${memory.title}" (${memory.type}) to OpenCode Brain. ID: ${memory.id}.`,
          };
        },
      });

      editor.add({
        name: 'search',
        description: 'Search stored memories and entities in OpenCode Brain before saving something new.',
        input: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Words to look for in titles, content, tags and descriptions.' },
            kind: { type: 'string', enum: ['all', 'memories', 'entities'], description: 'What to search.' },
          },
          required: ['query'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input) => {
          const { query, kind = 'all' } = input as { query: string; kind?: string };
          const needle = query.toLowerCase();
          const results: string[] = [];

          if (kind !== 'entities') {
            const memories = await api<BrainMemory[]>('/api/memories');
            const matches = memories
              .filter((m) => `${m.title} ${m.content} ${m.type}`.toLowerCase().includes(needle))
              .slice(0, 8);
            results.push(...matches.map((m) => `MEMORY ${m.id} [${m.type}] ${m.title}: ${m.content.slice(0, 160)}`));
          }
          if (kind !== 'memories') {
            const entities = await api<BrainEntity[]>('/api/entities');
            const matches = entities
              .filter((e) => `${e.name} ${e.type}`.toLowerCase().includes(needle))
              .slice(0, 8);
            results.push(...matches.map((e) => `ENTITY ${e.id} [${e.type}] ${e.name}`));
          }

          return {
            content: results.length ? results.join('\n') : `No OpenCode Brain results for "${query}".`,
          };
        },
      });

      editor.add({
        name: 'link_memories',
        description: 'Link two existing OpenCode Brain memories as related, strengthening the knowledge graph.',
        input: {
          type: 'object',
          properties: {
            first: { type: 'string', description: 'Exact or partial title / ID of the first memory.' },
            second: { type: 'string', description: 'Exact or partial title / ID of the second memory.' },
          },
          required: ['first', 'second'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input) => {
          const { first, second } = input as { first: string; second: string };
          const memories = await api<BrainMemory[]>('/api/memories');
          const a = findMemory(memories, first);
          const b = findMemory(memories, second);
          if (!a || !b) {
            return { content: `Could not find both memories. First: ${a?.title ?? 'not found'}, second: ${b?.title ?? 'not found'}.` };
          }
          await api(`/api/memories/${a.id}/link`, {
            method: 'POST',
            body: JSON.stringify({ memoryId: b.id }),
          });
          return { content: `Linked "${a.title}" and "${b.title}" in OpenCode Brain.` };
        },
      });
    });
  },
});
