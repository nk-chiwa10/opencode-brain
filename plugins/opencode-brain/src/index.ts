import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Plugin } from '@opencode/plugin';

const DEFAULT_BASE = 'http://127.0.0.1:3001';
const MEMORY_TYPES = ['conversation', 'decision', 'project-context', 'mistake', 'lesson', 'note'] as const;
const ENTITY_TYPES = [
  'person', 'project', 'technology', 'concept', 'decision', 'organization', 'location', 'event',
] as const;

const AGENT_INSTRUCTION = [
  'OPENCODE BRAIN IS YOUR PERSISTENT MEMORY.',
  'Always read the injected brain snapshot before answering anything that could depend on past work.',
  'For older or specific knowledge, call brain_search first — do not guess from general context.',
  'When the user makes a decision, learns a lesson, hits a mistake, or shares durable project context,',
  'save it with brain_save_memory. Link related knowledge with brain_link_memories.',
  'Use the other brain_* tools to update, remove and organize stored knowledge when appropriate.',
  'Do not store trivial chatter, temporary debugging output, or anything the user has not said is worth keeping.',
].join(' ');

export default Plugin.define({
  id: 'opencode-brain',
  async setup(ctx) {
    const base = String(ctx.options.baseUrl ?? process.env.OPENCODE_BRAIN_URL ?? DEFAULT_BASE)
      .replace(/\/+$/, '');
    const brainRoot = String(ctx.options.brainRoot ?? 'C:/Users/mcmadueno/opencode-brain');
    const autoStart = ctx.options.autoStart !== false;
    const fullControl = ctx.options.fullControl === true;

    let starting: Promise<void> | undefined;
    let snapshotCache: { at: number; text: string } | undefined;

    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const invalidate = () => { snapshotCache = undefined; };

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
          let details = '';
          const runtime = globalThis as typeof globalThis & {
            Bun?: { spawn: (command: string[], options: Record<string, unknown>) => unknown };
          };
          // process.execPath is the OpenCode CLI inside plugins, so use an explicit Node binary.
          const nodeBin = String(
            process.env.OPENCODE_BRAIN_NODE
            ?? (process.env.ProgramFiles ? `${process.env.ProgramFiles}/nodejs/node.exe` : 'node'),
          );
          if (runtime.Bun) {
            runtime.Bun.spawn([nodeBin, entry], {
              cwd: brainRoot,
              stdout: 'ignore',
              stderr: 'ignore',
              windowsHide: true,
              env: { ...process.env, OPENCODE_BRAIN_ROOT: brainRoot },
            });
          } else {
            const child = spawn(nodeBin, [entry], {
              cwd: brainRoot,
              detached: true,
              stdio: 'ignore',
              windowsHide: true,
            });
            child.on('error', (error) => { details += error.message; });
            child.unref();
          }
          for (let attempt = 0; attempt < 40; attempt += 1) {
            await wait(250);
            if (await healthy()) return;
          }
          const hint = details.trim().slice(0, 400);
          throw new Error(
            `OpenCode Brain did not start at ${base}. ${hint ? `Details: ${hint}` : 'Start it manually and try again.'}`,
          );
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

    async function authorize(
      action: string,
      resources: string[],
      context: { sessionID: string; agent?: string; messageID: string; id: string },
    ): Promise<void> {
      if (fullControl) return;
      await ctx.permission.assert({
        sessionID: context.sessionID,
        ...(context.agent ? { agent: context.agent } : {}),
        source: { type: 'tool', messageID: context.messageID, id: context.id },
        action,
        resources,
        save: [`${action}:*`],
      });
    }

    type BrainEntity = { id: string; name: string; type: string };
    type BrainMemory = {
      id: string; title: string; type: string; content: string; tags: string[];
      source: string | null; updated_at: string;
    };

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
      return memories.find((m) => m.id === query)
        ?? memories.find((m) => m.title.toLowerCase() === query)
        ?? memories.find((m) => m.title.toLowerCase().includes(query));
    }

    function brief(text: string, length = 180): string {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length > length ? `${flat.slice(0, length)}…` : flat;
    }

    async function brainSnapshot(): Promise<string> {
      if (snapshotCache && Date.now() - snapshotCache.at < 10_000) return snapshotCache.text;
      try {
        const [memories, entities] = await Promise.all([
          api<BrainMemory[]>('/api/memories'),
          api<BrainEntity[]>('/api/entities'),
        ]);
        const lines = [
          'OPENCODE BRAIN — your persistent memory. This snapshot is loaded at the start of every response.',
          `Stored: ${memories.length} memories, ${entities.length} entities.`,
          'Recent memories (newest first):',
          ...memories.slice(0, 15).map((m) => `- [${m.type}] ${m.title}: ${brief(m.content)}`),
          `Known entities: ${entities.slice(0, 50).map((e) => `${e.name} (${e.type})`).join(', ')}`,
          'For older or specific knowledge call brain_search. Save durable knowledge with brain_save_memory.',
        ];
        const text = lines.join('\n');
        snapshotCache = { at: Date.now(), text };
        return text;
      } catch {
        return '';
      }
    }

    // Load the brain into every model request so old sessions start with memory intact.
    await ctx.session.hook('context', async (event) => {
      const snapshot = await brainSnapshot();
      if (snapshot) event.system.push({ type: 'text', text: snapshot });
      event.system.push({ type: 'text', text: AGENT_INSTRUCTION });
    });

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: 'brain',
        description: 'OpenCode Brain: persistent memory, knowledge graph and history.',
      });

      editor.add({
        name: 'save_memory',
        description: 'Save a durable memory (decision, lesson, mistake, conversation or project context). Creates missing entities by name.',
        input: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short, specific title.' },
            content: { type: 'string', description: 'The memory itself, with enough detail to be useful later.' },
            type: { type: 'string', enum: [...MEMORY_TYPES], description: 'Kind of memory.' },
            tags: { type: 'array', items: { type: 'string' } },
            source: { type: 'string' },
            entityNames: { type: 'array', items: { type: 'string' }, description: 'Related people/projects/technologies; missing ones are created.' },
          },
          required: ['title', 'content'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          const data = input as {
            title: string; content: string; type?: string; tags?: string[];
            source?: string; entityNames?: string[];
          };
          await authorize('brain.save', [data.title], context);
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
          invalidate();
          return { content: `Saved memory "${memory.title}" (${memory.type}) to OpenCode Brain. ID: ${memory.id}.` };
        },
      });

      editor.add({
        name: 'search',
        description: 'Search stored memories and entities. Use this FIRST whenever past knowledge might matter.',
        input: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            kind: { type: 'string', enum: ['all', 'memories', 'entities'] },
          },
          required: ['query'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input) => {
          await authorize('brain.read', ['search'], {
            sessionID: 'plugin', messageID: 'plugin', id: 'brain.search',
          });
          const { query, kind = 'all' } = input as { query: string; kind?: string };
          const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
          const score = (text: string) =>
            tokens.reduce((total, token) => total + (text.includes(token) ? 1 : 0), 0);
          const results: string[] = [];
          if (kind !== 'entities') {
            const memories = await api<BrainMemory[]>('/api/memories');
            results.push(...memories
              .map((m) => ({ m, score: score(`${m.title} ${m.content} ${m.type} ${m.tags.join(' ')}`.toLowerCase()) }))
              .filter((entry) => entry.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map(({ m }) => `MEMORY ${m.id} [${m.type}] ${m.title} (${m.updated_at.slice(0, 10)}): ${brief(m.content, 220)}`));
          }
          if (kind !== 'memories') {
            const entities = await api<BrainEntity[]>('/api/entities');
            results.push(...entities
              .map((e) => ({ e, score: score(`${e.name} ${e.type}`.toLowerCase()) }))
              .filter((entry) => entry.score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 10)
              .map(({ e }) => `ENTITY ${e.id} [${e.type}] ${e.name}`));
          }
          return { content: results.length ? results.join('\n') : `No OpenCode Brain results for "${query}".` };
        },
      });

      editor.add({
        name: 'link_memories',
        description: 'Link two existing memories as related in the knowledge graph.',
        input: {
          type: 'object',
          properties: {
            first: { type: 'string', description: 'Title or ID of the first memory.' },
            second: { type: 'string', description: 'Title or ID of the second memory.' },
          },
          required: ['first', 'second'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          await authorize('brain.save', ['link memories'], context);
          const { first, second } = input as { first: string; second: string };
          const memories = await api<BrainMemory[]>('/api/memories');
          const a = findMemory(memories, first);
          const b = findMemory(memories, second);
          if (!a || !b) return { content: `Could not find both memories: "${first}", "${second}".` };
          await api(`/api/memories/${a.id}/link`, {
            method: 'POST', body: JSON.stringify({ memoryId: b.id }),
          });
          invalidate();
          return { content: `Linked "${a.title}" and "${b.title}".` };
        },
      });

      editor.add({
        name: 'add_entity',
        description: 'Add an entity (person, project, technology, concept, decision...) to the knowledge graph.',
        input: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: [...ENTITY_TYPES] },
            description: { type: 'string' },
          },
          required: ['name'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          await authorize('brain.save', [String(input.name)], context);
          const data = input as { name: string; type?: string; description?: string };
          const entity = await api<BrainEntity>('/api/entities', {
            method: 'POST',
            body: JSON.stringify({
              name: data.name,
              type: data.type ?? 'concept',
              description: data.description ?? '',
            }),
          });
          invalidate();
          return { content: `Added entity "${entity.name}" (${entity.type}). ID: ${entity.id}.` };
        },
      });

      editor.add({
        name: 'update_memory',
        description: 'Update an existing memory by ID or title. Only provided fields are changed.',
        input: {
          type: 'object',
          properties: {
            idOrTitle: { type: 'string' },
            title: { type: 'string' },
            content: { type: 'string' },
            type: { type: 'string', enum: [...MEMORY_TYPES] },
            tags: { type: 'array', items: { type: 'string' } },
            entityNames: { type: 'array', items: { type: 'string' } },
          },
          required: ['idOrTitle'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          await authorize('brain.save', ['update memory'], context);
          const data = input as {
            idOrTitle: string; title?: string; content?: string; type?: string;
            tags?: string[]; entityNames?: string[];
          };
          const memories = await api<BrainMemory[]>('/api/memories');
          const found = findMemory(memories, data.idOrTitle);
          if (!found) return { content: `Memory "${data.idOrTitle}" not found.` };
          const entityIds = data.entityNames ? await resolveEntities(data.entityNames) : undefined;
          await api(`/api/memories/${found.id}`, {
            method: 'PUT',
            body: JSON.stringify({
              ...(data.title ? { title: data.title } : {}),
              ...(data.content ? { content: data.content } : {}),
              ...(data.type ? { type: data.type } : {}),
              ...(data.tags ? { tags: data.tags } : {}),
              ...(entityIds ? { entityIds } : {}),
            }),
          });
          invalidate();
          return { content: `Updated memory "${found.title}".` };
        },
      });

      editor.add({
        name: 'delete_memory',
        description: 'Delete a memory by ID or title. Use carefully; deletion is recorded in the timeline.',
        input: {
          type: 'object',
          properties: { idOrTitle: { type: 'string' } },
          required: ['idOrTitle'],
          additionalProperties: false,
        },
        options: { namespace: 'brain', codemode: true },
        execute: async (input, context) => {
          await authorize('brain.save', ['delete memory'], context);
          const { idOrTitle } = input as { idOrTitle: string };
          const memories = await api<BrainMemory[]>('/api/memories');
          const found = findMemory(memories, idOrTitle);
          if (!found) return { content: `Memory "${idOrTitle}" not found.` };
          await api(`/api/memories/${found.id}`, { method: 'DELETE' });
          invalidate();
          return { content: `Deleted memory "${found.title}".` };
        },
      });
    });
  },
});
