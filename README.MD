# message-nodes

A tiny, framework-agnostic TypeScript utility for representing and manipulating **conversation message graphs** (threaded chats, branching regenerations, forks, etc.) using a simple `Record<string, MessageNode>` map.

It’s designed for UIs where:
- each message knows its `parent` (what it replies to),
- a parent can have **many children** (branches),
- the parent also keeps an **active child pointer** (`child`) to represent “currently selected” branch,
- every node tracks a `root` thread id.

All operations are **immutable**: functions return a *new* mappings object when something changes (and preserve referential equality when nothing changes), which plays nicely with React/Redux/Zustand/etc.

## Install

```sh
npm i message-nodes
```

(or)

```sh
yarn add message-nodes
```

## Core data model

```ts
export interface MessageNode<T = string> {
  id: string;
  role: string;
  content: T;

  // Thread root id (usually the id of the first/root node in a thread)
  root: string | undefined;

  // Parent pointer (reply-to)
  parent?: string | undefined;

  // "Active" child pointer for this parent (selected branch)
  child?: string | undefined;

  createTime: Date;
  updateTime: Date;
}
```

### A note on branching

Branching is represented by:
- **Many nodes** with `parent = <some id>` (these are the children).
- The parent’s `child` field points to the *currently active* child in the UI.

This lets you keep all alternates while selecting one to display as the “main path”.

## Quick start

```ts
import {
  addNode,
  getConversation,
  getChildren,
  nextChild,
  lastChild,
  setChild,
} from "message-nodes";

let mappings: Record<string, any> = {};

// Create a root
mappings = addNode(mappings, "root", "system", "You are a helpful assistant", undefined, undefined, undefined);

// Add a user message under root
mappings = addNode(mappings, "u1", "user", "Hello!", undefined, "root", undefined);

// Add two assistant replies branching off u1
mappings = addNode(mappings, "a1", "assistant", "Hi there!", undefined, "u1", undefined);
mappings = addNode(mappings, "a2", "assistant", "Hey! How can I help?", undefined, "u1", undefined);

// u1.child points to the latest added child (because addNode sets parent.child = new node id)
console.log(mappings["u1"].child); // "a2"

// Get the active conversation chain from root
const convo = getConversation(mappings, "root");
console.log(convo.map(n => `${n.role}: ${n.content}`));

// Switch active child for u1
mappings = lastChild(mappings, "u1"); // moves selection to previous branch (a1)
```

## API

### Lookup

#### `hasNode(mappings, id): boolean`
Returns `true` if `id` exists in the map.

#### `getNode(mappings, id): MessageNode | undefined`
Returns the node at `id` or `undefined`.

#### `getRoot(mappings, id): MessageNode | undefined`
Walks parent pointers until the top-most node and returns it.

### Traversal

#### `getConversation(mappings, rootId): MessageNode[]`
Returns the **active chain** starting at `rootId` by following:
1) the root node,
2) its `child`,
3) then each node’s `child`, etc.

It stops on missing nodes or cycles (and warns).

> Note: this returns the *selected branch path* only (not all branches).

#### `getAncestry(mappings, id): MessageNode[]`
Returns `[id, parent, grandparent, ...]` walking upward.
Stops on missing nodes or cycles (and warns).

#### `getChildren(mappings, parentId): MessageNode[]`
Returns all direct children (all nodes where `node.parent === parentId`).

### Branch selection (active child pointer)

#### `setChild(mappings, parentId, childId | undefined): Record<string, MessageNode>`
Sets the parent’s active `child` pointer.

Safety checks:
- parent must exist
- if `childId` is provided, it must exist **and** have `parent === parentId`

If nothing changes, returns the original `mappings` object.

#### `nextChild(mappings, parentId)`
Moves the active child to the next sibling among `getChildren(...)` order.
Warns if it can’t.

#### `lastChild(mappings, parentId)`
Moves the active child to the previous sibling among `getChildren(...)` order.
Warns if it can’t.

> Ordering note: `getChildren` uses `Object.values(mappings)` filtering, so sibling order depends on insertion/iteration order of the object. If you need stable ordering, consider storing an `index`/`createTime` and sorting in your UI before deciding which child is “next”.

### Mutation

All mutation-style helpers are immutable: they return a new map and keep the old one untouched.

#### `addNode(mappings, id, role, content, root, parent, child, createTime?, updateTime?)`
Adds a node and optionally links it into the graph.

Behavior:
- If `parent` is provided: `root` becomes `getRoot(parent)?.id ?? parent`
- If `parent` is not provided: the new node becomes its own root (`root = id`)
- Validates that provided `parent`, `child`, and `root` exist (when applicable)
- Links:
  - if `parent` exists, sets `parent.child = id` (selects the new node as active child)
  - if `child` exists, sets `child.parent = id`

#### `deleteNode(mappings, id)`
Deletes `id` **and all descendants** (all nodes that have `parent` pointers leading back to `id`), using `getChildren` recursion.

Also attempts to clean up pointers:
- If the node had a `parent` whose `child` pointed at `id`, that parent’s `child` becomes `undefined`
- If the node had an active `child` whose `parent === id`, that child’s `parent` becomes `undefined`
- Detects cycles during deletion and warns

#### `unlinkNode(mappings, id)`
Isolates a node:
- Detaches from its parent (clears parent’s active child if it was pointing here)
- Detaches from its active child (clears that child’s parent if it pointed back)
- Sets `node.parent = undefined`, `node.child = undefined`, `node.root = id`

#### `makeRoot(mappings, id)`
Turns a node into a new thread root:
- Detaches `id` from its parent (but keeps its subtree)
- Rewrites `root` on `id` and **all descendants** (follows both the explicit `child` chain and all `getChildren` branches)
- Detects cycles and avoids infinite loops

## Design notes / invariants

- `parent` is the structural relationship (a node can have many children).
- `child` is the *active selection* pointer on a parent (at most one selected child at a time).
- `setChild` enforces that `child.parent === parent` to keep the relationship consistent.
- Functions preserve referential equality when nothing changes (useful for React memoization).

## TypeScript + non-string content

`MessageNode<T>` is generic, so you can store richer content than strings:

```ts
type RichContent = { text: string; tokens?: number; model?: string };

let mappings: Record<string, MessageNode<RichContent>> = {};

mappings = addNode(
  mappings,
  "m1",
  "assistant",
  { text: "Hello!", model: "local-llm" },
  undefined,
  undefined,
  undefined
);
```

## Common patterns

### Show a thread in a UI (active branch)

```ts
const thread = getConversation(mappings, rootId);
// render thread
```

### Present alternate branches under a message

```ts
const options = getChildren(mappings, messageId);
// render options, highlight mappings[messageId].child
```

### Switch branches

```ts
mappings = setChild(mappings, messageId, chosenChildId);
// or mappings = nextChild(mappings, messageId);
```