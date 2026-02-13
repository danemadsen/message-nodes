# message-nodes

A tiny TypeScript utility for modeling **conversation threads** as a map of nodes with lightweight relationships:

- `parent` → points “up” the thread
- `child` → points to the **active** child (the currently selected branch)
- `root` → thread identifier (root nodes have `root === id`)
- `metadata` → optional extra data you want to store per message

It’s designed for chat UIs, branching conversations (“regenerate”), and tree-like message histories while keeping updates **immutable** (returns a new `mappings` object, preserves referential equality on no-ops where possible).

## Install

```sh
npm i message-nodes
```

(or)

```sh
yarn add message-nodes
```

## Data model

Each message is a `MessageNode`:

```ts
export interface MessageNode<C = string, M = Record<string, any>> {
  id: string;
  role: string;
  content: C;
  root: string;
  parent?: string | undefined;
  child?: string | undefined;
  metadata?: M | undefined;
}
```

### Mental model

- All nodes live in a single object: `Record<string, MessageNode>`
- Multiple children may share the same `parent` (branching), but:
  - the parent’s `child` property is the **active** child in that branch set

## Quick start

```ts
import {
  addNode,
  branchNode,
  getConversation,
  getRoots,
  makeRoot,
  updateContent,
  deleteNode,
  type MessageNode,
} from "message-nodes";

type Meta = { model?: string; tokens?: number };

let mappings: Record<string, MessageNode<string, Meta>> = {};

// Create a root message (no parent => root === id)
mappings = addNode(mappings, "root-1", "system", "New chat");

// Add first user message under the root
mappings = addNode(mappings, "u1", "user", "Hello!", undefined, "root-1");

// Add assistant response (as active child of u1)
mappings = addNode(mappings, "a1", "assistant", "Hi there 👋", undefined, "u1", undefined, { model: "gpt" });

// Read the active conversation chain from the root
const convo = getConversation(mappings, "root-1"); // [u1, a1]

// Branch the assistant response (e.g., regenerate)
mappings = branchNode(mappings, "a1", "a2", "Alternative answer", { model: "gpt", tokens: 123 });

// Now u1.child points to "a2" (active branch)
const convo2 = getConversation(mappings, "root-1"); // [u1, a2]

// Update content (immutable)
mappings = updateContent(mappings, "a2", (prev) => prev + " ✅");

// Delete a node and all descendants
mappings = deleteNode(mappings, "u1");
```

## API

### Reading helpers

#### `hasNode(mappings, id): boolean`
Returns `true` if the node exists.

#### `getNode(mappings, id): MessageNode | undefined`
Gets a node by id.

#### `getRoot(mappings, id): MessageNode | undefined`
Walks `parent` pointers until the top-most node.

> Note: `getRoot` finds the “top of chain” by `parent` pointers, while the `root` field is a thread identifier you can rewrite with `makeRoot`.

#### `getRoots(mappings): MessageNode[]`
Returns all thread roots (`node.root === node.id`).

#### `getConversation(mappings, rootId): MessageNode[]`
Returns the **active chain** from `rootId` following `.child` pointers.

- If the root doesn’t exist → `[]` (and warns)
- If the active chain contains a cycle → stops (and warns)

#### `getAncestry(mappings, id): MessageNode[]`
Returns `[node, parent, grandparent, ...]` walking `parent` pointers.
Detects cycles.

#### `getChildren(mappings, id): MessageNode[]`
Returns all direct children where `msg.parent === id`.

### Navigation helpers (active branch)

#### `setChild(mappings, parentId, childId | undefined): Record<...>`
Sets a parent’s active `child` pointer **only if**:
- parent exists
- child exists (if provided) and `child.parent === parentId`

No-op if it wouldn’t change anything.

#### `nextChild(mappings, parentId): Record<...>`
Moves the parent’s active `child` to the “next” sibling among `getChildren(parentId)`.

> The ordering is whatever `Object.values(mappings)` produces for `getChildren`, so if you need deterministic order, keep your own ordering strategy (e.g. store `createdAt` in metadata and sort externally).

#### `lastChild(mappings, parentId): Record<...>`
Moves the parent’s active `child` to the “previous” sibling.

### Writing helpers

#### `addNode(mappings, id, role, content, root?, parent?, child?, metadata?): Record<...>`
Adds a new node, optionally linking it.

Behavior:
- If `parent` is not provided: the node becomes a root (`root = id`)
- If `parent` is provided: `root` is inferred from `getRoot(parent)` (top of chain), and the parent’s active `child` is set to the new node
- If `child` is provided: the child’s `parent` is set to the new node

Validates that referenced `parent`, `child`, and `root` exist (when applicable), otherwise returns unchanged and warns.

#### `branchNode(mappings, existingId, siblingId, content, metadata?): Record<...>`
Creates a sibling under the same parent as `existingId`.

- Uses the existing node’s `role`, `root`, and `parent`
- Makes the new sibling the **active** child of the parent (via `addNode` behavior)

Great for “regenerate answer” branching.

#### `updateContent(mappings, id, contentOrUpdater, metadataOrUpdater?): Record<...>`
Updates a node’s `content` (and optionally `metadata`) immutably.

- `content` can be a value or `(prev) => next`
- `metadata` can be a value or `(prev) => next`
- Returns unchanged on no-op updates (content is `Object.is` equal)

#### `deleteNode(mappings, id): Record<...>`
Deletes the node and **all descendants** (all nodes reachable via `parent === id`, recursively).

Also attempts to keep the parent thread usable:
- If the deleted node was the parent’s active child, it switches the parent’s `child` to another sibling if one exists.

Cycle-safe.

#### `unlinkNode(mappings, id): Record<...>`
Isolates the node:
- clears its `parent`, `child`
- sets `root = id`
- detaches it from its parent’s active child pointer (if pointing at it)
- detaches its child’s parent pointer (if pointing at it)

#### `makeRoot(mappings, id): Record<...>`
Converts a node into a root **without deleting its subtree**.

- Detaches it from its parent (parent’s active child cleared if it was pointing at this node)
- Rewrites `root` on the node **and all descendants** (following both the active `.child` chain and all direct children via `getChildren`), so the whole sub-tree becomes a new thread.

## Common patterns

### “Regenerate” / branching answers

```ts
// Suppose u1.child is currently "a1"
mappings = branchNode(mappings, "a1", "a2", "New answer");
mappings = updateContent(mappings, "a2", "Streaming...");
```

### Multiple threads (roots)

```ts
const roots = getRoots(mappings); // list of root nodes (threads)
```

### Keep UI state in metadata

```ts
type Meta = { selected?: boolean; createdAt?: number };

mappings = updateContent(
  mappings,
  "u1",
  (c) => c,
  (m) => ({ ...(m ?? {}), selected: true })
);
```

## Notes / caveats

- `getConversation` follows the **active** `.child` chain only. If you want “all nodes in a thread”, you can start from a root and traverse via `getChildren` recursively.
- `nextChild` / `lastChild` depend on the order returned by `getChildren` (which is based on object iteration). For deterministic ordering, store ordering metadata and build your own sorted child list.
- Functions generally warn and return the original mappings on invalid operations, preserving referential equality.

## License

```
MIT License

Copyright (c) 2026 Dane Madsen

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
