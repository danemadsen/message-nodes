# message-node

A tiny, dependency-free utility library for representing conversations as a **node graph** stored in a plain object mapping.

It’s designed for UIs that need:
- a **linear “current conversation”** path (via `child` pointers), *and*
- **branching alternatives** (multiple children share the same `parent`), like conversation regeneration trees.
> **Important note for this README:** Code blocks inside this README use ````` instead of ``` so you can paste this into places where triple-backticks would conflict.

---

## Install

```bash
npm i message-node
# or
yarn add message-node
# or
pnpm add message-node
```

---

## Data model

Each message is a node:

- `id`: unique node id
- `role`: e.g. `"user" | "assistant" | "system"` (you decide)
- `content`: generic payload (`string` by default)
- `root`: id of the root node of the thread (usually equals the root node’s `id`)
- `parent`: id of the parent node (optional)
- `child`: id of the **currently selected** child along the “active” linear path (optional)
- `createTime`, `updateTime`: timestamps

```ts
export interface MessageNode<T = string> {
  id: string;
  role: string;
  content: T;
  root: string | undefined;
  parent?: string | undefined;
  child?: string | undefined; 
  createTime: Date;
  updateTime: Date;
}
```

### Mental model

Think of `mappings` as your database:

```ts
type Mappings<T = string> = Record<string, MessageNode<T>>;
```

- **Branching** is represented by multiple nodes having `parent = someId`
- The **active path** is represented by each node’s `child` pointer:
  - `root.child -> ... -> ...` gives the “current conversation” sequence

---

## Quick start

Create a root message and append a few nodes:

```ts
import {
  addNode,
  getConversation,
} from "message-node";

const mappings = {};

// Create a root node (no parent)
addNode(
  mappings,
  "root",
  "system",
  "You are ChatGPT.",
  undefined,
  undefined,
  undefined
);

// Add a user message under root
addNode(
  mappings,
  "u1",
  "user",
  "Hello!",
  "root",      // optional: will be corrected/validated
  "root",      // parent
  undefined
);

// Add assistant response under u1
addNode(
  mappings,
  "a1",
  "assistant",
  "Hey! How can I help?",
  "root",
  "u1",
  undefined
);

// Follow the active path starting from the root id:
const thread = getConversation(mappings, "root");
console.log(thread.map(m => `${m.role}: ${m.content}`));
```

---

## Core operations

### `hasNode(mappings, id)`
Returns whether a node exists.

```ts
import { hasNode } from "message-node";

if (!hasNode(mappings, "a1")) {
  // ...
}
```

### `getNode(mappings, id)`
Returns a node or `undefined`.

```ts
import { getNode } from "message-node";

const node = getNode(mappings, "u1");
```

### `getRoot(mappings, id)`
Walks `parent` pointers up until it finds the top node.

```ts
import { getRoot } from "message-node";

const root = getRoot(mappings, "a1"); // -> node "root"
```

---

## Traversal helpers

### `getConversation(mappings, rootId)`
Returns the **active linear path** of a thread by following `root.child -> child.child -> ...`.

- Warns and stops if it detects a cycle.
- If `rootId` doesn’t exist, returns `[]`.

```ts
import { getConversation } from "message-node";

const active = getConversation(mappings, "root");
```

### `getAncestry(mappings, id)`
Returns `[start, parent, parent-of-parent, ...]` until it hits the top.

- Warns and stops on cycles.

```ts
import { getAncestry } from "message-node";

const chain = getAncestry(mappings, "a1"); // ["a1", "u1", "root"]
```

### `getChildren(mappings, id)`
Returns all direct children (branch candidates) of the node id.

```ts
import { getChildren } from "message-node";

const options = getChildren(mappings, "u1"); // e.g. multiple assistant regenerations
```

---

## Branching + selecting the active child

A node can have multiple children (branching), but only one is “active” via `parent.child`.

### `setChild(mappings, parentId, childId | undefined)`
Sets the active child pointer on the parent.

- If `childId` is `undefined`, clears the selection.
- Only allows setting if `childId` exists and `mappings[childId].parent === parentId`.

```ts
import { setChild } from "message-node";

setChild(mappings, "u1", "a1");      // select a1
setChild(mappings, "u1", undefined); // clear selection
```

### `nextChild(mappings, parentId)` / `lastChild(mappings, parentId)`
Cycles the active child selection through the list returned by `getChildren`.

Notes:
- Children ordering comes from `Object.values(mappings)` filtering, so if you care about ordering, consider sorting children yourself (e.g. by `createTime`) before choosing which child to set.

```ts
import { nextChild, lastChild } from "message-node";

nextChild(mappings, "u1"); // move active selection forward
lastChild(mappings, "u1"); // move active selection backward
```

---

## Editing and deletion

### `unlinkNode(mappings, id)`
Detaches a node from its parent/child pointers:

- If it was the selected `child` of its parent, clears that pointer.
- If it had a `child` selected, clears that child’s `parent` pointer (if it matched).
- Sets `node.parent = undefined`, `node.child = undefined`, and `node.root = id`.

This isolates the node (it becomes its own root id).

```ts
import { unlinkNode } from "message-node";

unlinkNode(mappings, "u1");
```

### `deleteNode(mappings, id)`
Deletes a node and **all of its descendants** (based on `getChildren` recursion).

- First unlinks the node (so parent/child pointers are cleaned up)
- Detects cycles to avoid infinite recursion

```ts
import { deleteNode } from "message-node";

deleteNode(mappings, "u1"); // removes u1 and all its branch descendants
```

---

## Making a node a new root

### `makeRoot(mappings, id)`
Turns a node into a root of its own thread:

- Detaches it from its parent (but keeps its subtree)
- Rewrites `.root` on the node **and all descendants**
  - Traverses both the explicit `child` chain and all branching children.

```ts
import { makeRoot } from "message-node";

makeRoot(mappings, "u1"); // u1 becomes a new root; its subtree root ids are rewritten
```

---

## Recommended usage patterns

### 1) Keep `mappings` as your single source of truth
Your UI can derive:
- active linear message: `getConversation(mappings, rootId)`
- current branch options: `getChildren(mappings, parentId)`
- breadcrumb / context: `getAncestry(mappings, currentId)`

### 2) Be explicit about ordering if you care
`getChildren` returns in object enumeration order. If you need deterministic behavior:
- sort by `createTime`, or
- maintain your own ordered child list externally, or
- choose active child explicitly with `setChild`.

### 3) Treat warnings as signals, not errors
Most functions are intentionally “safe”:
- they `console.warn` on invalid inputs or cycles
- they avoid throwing and keep your app running

---

## API reference

```ts
// Existence / lookup
hasNode(mappings, id): boolean
getNode(mappings, id): MessageNode | undefined
getRoot(mappings, id): MessageNode | undefined

// Traversal
getConversation(mappings, rootId): MessageNode[]
getAncestry(mappings, id): MessageNode[]
getChildren(mappings, id): MessageNode[]

// Branch selection
setChild(mappings, parentId, childId | undefined): void
nextChild(mappings, parentId): void
lastChild(mappings, parentId): void

// Mutation
addNode(mappings, id, role, content, root, parent, child, createTime?, updateTime?): void
unlinkNode(mappings, id): void
deleteNode(mappings, id): void
makeRoot(mappings, id): void
```
