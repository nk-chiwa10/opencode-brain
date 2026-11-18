# OpenCode Brain — User Manual

A local app for storing memories, connecting them into a knowledge graph, and exploring the result. No cloud, no account — all data lives in `data/brain.db` on your machine.

---

## 1. Start the app

```bash
cd C:\Users\mcmadueno\opencode-brain
npm run dev
```

Open **http://localhost:5173** in your browser.

The API runs on port 3001 in the background; you don't need to open it directly. The first run seeds a small demo brain so the graph isn't empty.

To stop the app, press `Ctrl+C` in the terminal.

---

## 2. The four areas of the screen

```
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR   Graph | Timeline | Intelligence      Export Import │
├──────────────┬───────────────────────────┬───────────────────┤
│ SIDEBAR      │ CANVAS                    │ INSPECTOR         │
│ search       │ graph / timeline /        │ details of the    │
│ memories     │ intelligence view         │ selected item     │
│ entities     │                           │ + edit forms      │
└──────────────┴───────────────────────────┴───────────────────┘
```

- **Top bar** — switch views, create items, export/import backups.
- **Sidebar** — search and browse everything you've stored. Tabs switch between *Memories* and *Entities*.
- **Canvas** — the main workspace. What it shows depends on the view you picked.
- **Inspector** — click anything and its details appear here, where you can also edit it.

---

## 3. Store your first memory

1. Click the green **+ Memory** button in the top-right.
2. Fill in:
   - **Title** — a short label ("Why we chose SQLite").
   - **Type** — conversation, decision, project-context, mistake, lesson, or note.
   - **Source** — optional origin (a meeting, a file, a conversation).
   - **Content** — the actual memory.
   - **Tags** — comma-separated, e.g. `architecture, database`.
   - **Link to entities** — tick any existing entities this memory relates to.
3. Click **Save memory**.

The memory appears in the sidebar and, if linked to entities, in the graph's orbit.

**Types at a glance**

| Type | Use for |
| --- | --- |
| Conversation | Something said in a session worth remembering |
| Decision | A choice made and why |
| Project-context | Background info about a project |
| Mistake | Something that went wrong |
| Lesson | What you learned from it |
| Note | Anything else |

---

## 4. Add entities (the graph's nodes)

Entities are the *things* your brain knows about: people, projects, technologies, concepts, decisions, organizations, locations, events.

1. Click **Entity** in the top bar (or **Add** on the sidebar's *Entities* tab).
2. Enter a **Name**, choose a **Type**, and optionally a **Description**.
3. Click **Add entity**.

The new node appears in the graph immediately.

---

## 5. Connect entities with relationships

Relationships are the *edges* between nodes, and they have a type ("uses", "owns", "decided", "built_on"…).

1. Click **Relationship** in the top bar.
2. Choose **From** and **To** entities.
3. Type a relationship name, e.g. `uses`.
4. Optionally add a description.
5. Click **Create relationship**.

Shortcut: select an entity in the graph or sidebar, then in the Inspector click **Add relationship** — the "From" field is prefilled.

You can edit a relationship's type, description and weight, or delete it, by selecting it from the graph edge or by clicking a connection in the Inspector.

---

## 6. Explore the Visual Brain (Graph view)

- **Click a node** — the graph dims everything unrelated, highlights its direct connections, and shows a **Related memories** panel in the top-right. Full details open in the Inspector.
- **Click a memory in the related panel or sidebar** — the Inspector shows that memory and its linked entities.
- **Drag nodes** to rearrange them. Positions persist while the app is open.
- **Scroll to zoom**, drag empty space to pan, or use the controls at bottom-left. Use the fit-view button to re-frame the graph.
- **Click empty space** to clear the selection.
- **Colored dots** in the legend (top-left) show what each entity type means.

---

## 7. Link memories into the graph

A memory becomes part of the graph when it's linked to entities:

- **When creating** — tick entities in the *Link to entities* section.
- **Afterwards** — select the memory, then in the Inspector use the **Linked entities** section:
  - the dropdown + **Link** button attaches an entity;
  - the unlink icon on a chip removes it.

Clicking an entity chip jumps you to that entity.

---

## 8. Find duplicates and related information (Intelligence view)

Click **Intelligence** in the top bar. Two tools run locally over your memory text:

**Possible duplicates**
- Groups memories with very similar content, with a match percentage.
- Click any title to open it in the Inspector.
- **Merge** folds a duplicate into the first ("primary") memory: content and tags are combined, entity links are unioned, and the old memory is marked *replaced* (it stays in history, but no longer clutters the list).

**Related memories**
- Pairs of memories that overlap but aren't duplicates, ranked by score.
- **Link** creates an explicit memory↔memory connection; **Linked** can be clicked to remove it.
- Clicking either title opens that memory.

The Inspector for a selected memory also shows a **Related memories** section and **Suggested entities** (entities mentioned in the text or co-occurring in similar memories) with one-click linking.

> Ranking is TF-IDF keyword similarity — it works offline and needs no AI. Short, generic memories may score low; richer content gives better suggestions.

---

## 9. Review history (Timeline view)

Click **Timeline** in the top bar.

- Entries are grouped by day and show **Created / Updated / Replaced / Deleted**.
- Filter by subject (memories or entities) and by action using the dropdowns at the top-right.
- Click any entry to jump to that item in the Graph view with the Inspector open.
- The Inspector also shows the last six history events for whatever you have selected.

A "Replaced" entry means a memory was merged into another; the old version is kept in history for reference.

---

## 10. Search and browse

The sidebar search box filters the active tab (memories or entities) as you type. It matches titles, content, tags, descriptions and types.

Switch tabs with the **Memories / Entities** buttons to search the other kind of item.

---

## 11. Back up and restore

**Export** — click **Export** in the top bar. A JSON file downloads containing all memories, entities, relationships, links, and history. Keep it somewhere safe.

**Import** — click **Import**, choose a previously exported JSON file, and confirm. Import **replaces everything currently in the brain**, so export first if you want to keep the current state.

This is the way to move your brain to another computer.

---

## 12. Everyday workflows

**Capture a lesson from a debugging session**
1. + Memory → type *Lesson*, title "Fix: SQLite WAL lock", paste the details, tags `debugging, sqlite`.
2. Link it to the *SQLite* and *OpenCode Brain* entities.
3. Later, use Intelligence to find other debugging memories and link them.

**Clean up repeated notes**
1. Open Intelligence → Possible duplicates.
2. Click **Merge** on the secondary entries.
3. Check Timeline to see the "Replaced" event.

**Understand a project at a glance**
1. Open Graph view, click the project node.
2. Read the connected entities and the Related memories panel.
3. Open the Inspector's History section to see how the project knowledge evolved.

---

## 13. Where data lives / troubleshooting

- Database: `C:\Users\mcmadueno\opencode-brain\data\brain.db` (SQLite, WAL mode). Do not edit it manually while the app is running.
- Backups: JSON files you export yourself.
- If the page won't load, make sure `npm run dev` is still running and that port 5173 isn't in use.
- If the graph appears empty, the API may have failed to load — check the terminal for errors and reload the page.
- If you upgrade the app, existing data is preserved and a one-time history backfill runs automatically.

---

## 14. Using it automatically from OpenCode

The OpenCode plugin is already installed and loaded globally, so you don't need to start anything special.

- The brain is loaded automatically into every OpenCode request. Even a brand-new session on an old project starts with your recent memories and known entities already in context.
- The agent searches the brain first whenever past knowledge could matter, then can save, update, link or delete knowledge without asking.
- It proactively captures decisions, lessons, mistakes and durable project context.
- There are **no approval prompts** — the plugin has full control by design.
- You can also ask explicitly: *"save that decision to my brain"*, *"what do I already know about SQLite?"*, or *"update my memory about the backup policy"*.
- The six tools are `brain_save_memory`, `brain_search`, `brain_link_memories`, `brain_add_entity`, `brain_update_memory` and `brain_delete_memory`.

If you want confirmation before writes, change `fullControl` to `false` in the plugin options, or change the `brain.save` permission effect from `allow` to `ask` in `~/.config/opencode/opencode.json`. A backup of the original config is saved as `opencode.json.backup-brain-plugin`.

If the brain server isn't running, the plugin starts it automatically from the built app. If that fails, run `npm run dev` in the project folder and reload OpenCode with `/reload`.

## 15. Keyboard and accessibility

- `Tab` moves through controls; focus is always visible with a 2px outline.
- List items and graph nodes support `Enter` and `Space` to select.
- Motion respects your system's *reduce motion* setting.
- A **Skip to main content** link is available when you first press Tab.
