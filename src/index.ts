/**
 * Represents a message node in a conversation thread, containing information about the message's ID, role, content, and relationships to other messages.
 */
export interface MessageNode<C = string, M = Record<string, any>> {
  id: string;
  role: string;
  content: C;
  root: string;
  parent?: string | undefined;
  child?: string | undefined; 
  metadata?: M | undefined;
}

function cloneNode<C, M>(node: MessageNode<C, M>): MessageNode<C, M> {
  return { ...node };
}

function updateMap<C, M>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  fn: (draft: Record<string, MessageNode<C, M>>) => void
): Record<string, MessageNode<C, M>> {
  // shallow clone the map, then let fn mutate the clone
  const next: Record<string, MessageNode<C, M>> = { ...(mappings as any) };
  fn(next);
  return next;
}

/**
 * Checks if a node exists in the mappings.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to check.
 * @returns True if the node exists, false otherwise.
 */
export function hasNode<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>, 
  id: string
): boolean {
  return !!mappings[id];
}

/**
 * Retrieves a node from the mappings by its ID.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to retrieve.
 * @returns The MessageNode object if found, or undefined if not found.
 */
export function getNode<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>, 
  id: string
): MessageNode<C, M> | undefined {
  return mappings[id];
}

/**
 * Retrieves the root node of a conversation thread given any node ID.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to start from.
 * @returns The root MessageNode object if found, or undefined if not found.
 */
export function getRoot<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>, 
  id: string
): MessageNode<C, M> | undefined {
  let current = mappings[id];
  if (!current) return undefined;

  while (current.parent && mappings[current.parent]) {
    current = mappings[current.parent]!;
  }

  return current;
}

/**
 * Retrieves all root nodes in the mappings.
 * Root nodes are any nodes where node.root === node.id.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @returns An array of MessageNode objects that are roots.
 */
export function getRoots<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>
): Array<MessageNode<C, M>> {
  return Object.values(mappings).filter((node) => node.root === node.id);
}

/**
 * Retrieves the conversation thread starting from the root message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param root The ID of the root message to start from.
 * @returns An array of MessageNode objects representing the conversation thread.
 */
export function getConversation<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>,
  root: string
): Array<MessageNode<C, M>> {
  const rootNode = getNode(mappings, root);
  if (!rootNode) {
    console.warn(`Root message with ID: ${root} does not exist.`);
    return [];
  }

  const conversation: Array<MessageNode<C, M>> = [rootNode];
  const seen = new Set<string>([rootNode.id]);

  let currentId = rootNode.child;

  while (currentId) {
    const current = getNode(mappings, currentId);
    if (!current) break;

    if (seen.has(current.id)) {
      console.warn(`Cycle detected in conversation at ID: ${current.id}`);
      break;
    }
    seen.add(current.id);

    conversation.push(current);
    currentId = current.child;
  }

  return conversation;
}

/**
 * Retrieves all ancestor messages of a given message ID.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param id The ID of the message to start from.
 * @returns An array of MessageNode objects representing the ancestors of the specified message ID.
 */
export function getAncestry<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>,
  id: string
): Array<MessageNode<C, M>> {
  const start = getNode(mappings, id);
  if (!start) {
    console.warn(`Message with ID: ${id} does not exist.`);
    return [];
  }

  const out: Array<MessageNode<C, M>> = [];
  const seen = new Set<string>();

  let current: MessageNode<C, M> | undefined = start;
  while (current) {
    if (seen.has(current.id)) {
      console.warn(`Cycle detected in ancestry at ID: ${current.id}`);
      break;
    }
    seen.add(current.id);

    out.push(current);
    current = current.parent ? getNode(mappings, current.parent) : undefined;
  }

  return out;
}

/**
 * Returns a new mappings object containing ONLY:
 * - the node with id === rootId
 * - all descendants connected to it (via parent -> children links), including branches
 *
 * This does NOT include other roots or their lineages unless they are actually connected
 * (i.e., reachable as descendants of rootId).
 */
export function getRootMapping<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>,
  root: string
): Record<string, MessageNode<C, M>> {
  const rootNode = mappings[root];
  if (!rootNode) {
    console.warn(`Root node with ID: ${root} does not exist.`);
    return {};
  }

  // Build parent -> children index once (O(n)), so traversal is O(size_of_subtree).
  const childrenByParent: Record<string, string[]> = {};
  for (const node of Object.values(mappings)) {
    if (!node.parent) continue;
    // Only index edges where the parent exists in the map
    if (!mappings[node.parent]) continue;
    (childrenByParent[node.parent] ??= []).push(node.id);
  }

  const out: Record<string, MessageNode<C, M>> = {};
  const seen = new Set<string>();
  const stack: string[] = [root];

  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) {
      console.warn(`Cycle detected in root mapping at ID: ${id}`);
      continue;
    }
    seen.add(id);

    const node = mappings[id];
    if (!node) continue;

    out[id] = node;

    const kids = childrenByParent[id];
    if (kids) {
      for (const kidId of kids) stack.push(kidId);
    }
  }

  return out;
}

/**
 * Retrieves all direct child messages of a given message ID.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param id The ID of the parent message.
 * @returns An array of MessageNode objects that are direct children of the specified message ID.
 */
export function getChildren<C = string, M = Record<string, any>>(
  mappings: Record<string, MessageNode<C, M>>, 
  id: string
): Array<MessageNode<C, M>> {
  return Object.values(mappings).filter((msg) => msg.parent === id);
}

/**
 * Moves to the next child message of a given parent message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @returns A new mappings object (or the original if no change).
 */
export function nextChild<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  parent: string
): Record<string, MessageNode<C, M>> {
  const parentNode = mappings[parent];
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  const children = getChildren(mappings as any, parent);
  const idx = children.findIndex((c) => c.id === parentNode.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<C, M>>;
  }
  if (idx + 1 >= children.length) {
    console.warn(`No next child available for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  return setChild<C, M>(mappings, parent, children[idx + 1]!.id);
}

/**
 * Moves to the previous child message of a given parent message.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @returns A new mappings object (or the original if no change).
 */
export function lastChild<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  parent: string
): Record<string, MessageNode<C, M>> {
  const parentNode = mappings[parent];
  if (!parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  const children = getChildren(mappings as any, parent);
  const idx = children.findIndex((c) => c.id === parentNode.child);

  if (idx === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<C, M>>;
  }
  if (idx - 1 < 0) {
    console.warn(`No previous child available for parent ID: ${parent}`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  return setChild<C, M>(mappings, parent, children[idx - 1]!.id);
}

/**
 * Sets the child of a parent message to a specified child message, ensuring that the parent-child relationship is valid.
 * @param mappings A record mapping message IDs to MessageNode objects.
 * @param parent The ID of the parent message.
 * @param child The ID of the child message to set.
 * @returns A new mappings object (or the original if no change).
 */
export function setChild<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  parent: string,
  child: string | undefined
): Record<string, MessageNode<C, M>> {
  const p0 = mappings[parent];
  if (!p0) return mappings as Record<string, MessageNode<C, M>>;

  if (child !== undefined) {
    const c0 = mappings[child];
    if (!c0 || c0.parent !== parent) return mappings as Record<string, MessageNode<C, M>>;
  }

  // No-op guard (keeps referential equality if nothing changes)
  if (p0.child === child) return mappings as Record<string, MessageNode<C, M>>;
  return updateMap(mappings, (draft) => {
    // clone parent before mutation
    draft[parent] = cloneNode(draft[parent]!);
    draft[parent]!.child = child;
  });
}

/**
 * Deletes a node and all of its child nodes from the mappings.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the parent node.
 * @returns A new mappings object (or the original if no change).
 */
export function deleteNode<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string
): Record<string, MessageNode<C, M>> {
  if (!mappings[id]) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  return updateMap(mappings, (draft) => {
    const seen = new Set<string>();

    const parentId = draft[id]?.parent;
    if (parentId && draft[parentId]?.child === id) {
      draft[parentId] = cloneNode(draft[parentId]!);
      draft[parentId].child = Object.values(draft).find((n) => n.parent === parentId && n.id !== id)?.id;
    }

    _deleteNodeInternal(draft, id, seen);
  });
}

function _deleteNodeInternal<C, M>(
  draft: Record<string, MessageNode<C, M>>,
  id: string,
  seen: Set<string>
): void {
  const node = draft[id];
  if (!node) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return;
  }

  if (seen.has(id)) {
    console.warn(`Cycle detected while deleting at ID: ${id}`);
    return;
  }
  seen.add(id);

  const childIds = getChildren<C, M>(draft as any, id).map((c) => c.id);

  for (const childId of childIds) {
    _deleteNodeInternal<C, M>(draft, childId, seen);
  }

  const parentId = node.parent;
  if (parentId) {
    const parent = draft[parentId];
    if (parent?.child === id) {
      draft[parentId] = cloneNode<C, M>(parent);
      draft[parentId]!.child = undefined;
    }
  }

  const activeChildId = node.child;
  if (activeChildId) {
    const activeChild = draft[activeChildId];
    if (activeChild?.parent === id) {
      draft[activeChildId] = cloneNode<C, M>(activeChild);
      draft[activeChildId]!.parent = undefined;
    }
  }

  delete draft[id];
}

/**
 * Unlinks a node from its parent and child nodes, effectively isolating it in the conversation thread.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to unlink.
 * @returns A new mappings object (or the original if no change).
 */
export function unlinkNode<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string
): Record<string, MessageNode<C, M>> {
  const node0 = mappings[id];
  if (!node0) return mappings as Record<string, MessageNode<C, M>>;

  // If it's already isolated, keep referential equality
  const already =
    node0.parent === undefined &&
    node0.child === undefined &&
    node0.root === id;

  if (already) return mappings as Record<string, MessageNode<C, M>>;

  return updateMap<C, M>(mappings, (draft) => {
    const node = draft[id];
    if (!node) return;

    // parent side
    if (node.parent && draft[node.parent]) {
      const pId = node.parent;
      const p = draft[pId]!;
      if (p.child === id) {
        draft[pId] = cloneNode<C, M>(p);
        draft[pId]!.child = undefined;
      }
    }

    // child side
    if (node.child && draft[node.child]) {
      const cId = node.child;
      const c = draft[cId]!;
      if (c.parent === id) {
        draft[cId] = cloneNode<C, M>(c);
        draft[cId]!.parent = undefined;
      }
    }

    // isolate self
    draft[id] = cloneNode<C, M>(node);
    draft[id]!.parent = undefined;
    draft[id]!.child = undefined;
    draft[id]!.root = id;
  });
}

/**
 * Adds a new node to the mappings with optional parent-child relationships.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the new node to be added.
 * @param role The role associated with the new node (e.g., "user", "assistant").
 * @param content The content of the new node.
 * @param root The ID of the root node for this new node (if not provided, it will be determined based on the parent).
 * @param parent The ID of the parent node (if any).
 * @param child The ID of the child node (if any).
 * @param metadata Optional metadata to associate with the new node.
 * @returns A new mappings object (or the original if no change).
 */
export function addNode<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string,
  role: string,
  content: C,
  root: string | undefined = undefined,
  parent: string | undefined = undefined,
  child: string | undefined = undefined,
  metadata: M | undefined = undefined
): Record<string, MessageNode<C, M>> {
  if (hasNode<C, M>(mappings as any, id)) {
    console.warn(`Node with ID: ${id} already exists.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  // Validate parent/child existence up-front (prevents partial mutation).
  const parentNode = parent ? (mappings as any)[parent] as MessageNode<C, M> | undefined : undefined;
  if (parent && !parentNode) {
    console.warn(`Parent node with ID: ${parent} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  const childNode = child ? (mappings as any)[child] as MessageNode<C, M> | undefined : undefined;
  if (child && !childNode) {
    console.warn(`Child node with ID: ${child} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  // Determine root
  if (!parent) {
    root = id;
  } else {
    root = getRoot<C, M>(mappings as any, parent)?.id ?? parent;
  }

  if (root && !hasNode<C, M>(mappings as any, root) && root !== id) {
    console.warn(`Root node with ID: ${root} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  return updateMap<C, M>(mappings, (draft) => {
    // create node
    draft[id] = {
      id,
      role,
      content,
      root,
      parent,
      child,
      metadata
    };

    // link parent -> this (active child)
    if (parent) {
      const p = draft[parent];
      if (p) {
        draft[parent] = cloneNode<C, M>(p);
        // keep the old invariant: only point to a child that claims this parent
        if (draft[id]!.parent === parent) {
          draft[parent]!.child = id;
        }
      }
    }

    // link child -> this (parent pointer)
    if (child) {
      const c = draft[child];
      if (c) {
        draft[child] = cloneNode<C, M>(c);
        draft[child]!.parent = id;
      }
    }
  });
}

/**
 * Creates a sibling node by adding a new node with the same parent as the specified node.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the existing node to create a sibling for.
 * @param sibling The ID of the new sibling node to be added.
 * @param content The content of the new sibling node.
 * @param metadata Optional metadata to associate with the new sibling node.
 * @returns A new mappings object (or the original if no change).
 */
export function branchNode<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string,
  sibling: string,
  content: C,
  metadata: M | undefined = undefined
): Record<string, MessageNode<C, M>> {
  const node0 = mappings[id];
  if (!node0) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  if (hasNode(mappings as any, sibling)) {
    console.warn(`Node with ID: ${sibling} already exists.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  // Ensure parent exists if we're branching under a parent.
  if (node0.parent && !mappings[node0.parent]) {
    console.warn(`Parent node with ID: ${node0.parent} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  // addNode will:
  // - set root correctly from parent (or make sibling a root if no parent)
  // - set parent.child = sibling (active branch)
  return addNode<C, M>(
    mappings,
    sibling,
    node0.role,
    content,
    node0.root,
    node0.parent,
    undefined,
    metadata
  );
}

/**
 * Updates the content of a node with the specified ID.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to update.
 * @param content The new content for the node, or a function that takes the previous content and returns the new content.
 * @param metadata Optional metadata to associate with the node.
 * @returns A new mappings object (or the original if no change).
 */
export function updateContent<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string,
  content: C | ((prev: C) => C),
  metadata?: M | ((prev: M | undefined) => M) | undefined
): Record<string, MessageNode<C, M>> {
  const node0 = mappings[id];
  if (!node0) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  const newContent =
    typeof content === "function"
      ? (content as (prev: C) => C)(node0.content)
      : content;

  const metadataProvided = metadata !== undefined;

  const newMetadata =
    typeof metadata === "function"
      ? (metadata as (prev: M | undefined) => M)(node0.metadata)
      : metadata;

  const contentUnchanged = Object.is(node0.content, newContent);
  const metadataUnchanged = !metadataProvided || Object.is(node0.metadata, newMetadata);

  // no-op only if BOTH are unchanged
  if (contentUnchanged && metadataUnchanged) {
    return mappings as Record<string, MessageNode<C, M>>;
  }

  return updateMap<C, M>(mappings, (draft) => {
    const node = draft[id];
    if (!node) return;

    const next = cloneNode<C, M>(node);

    if (!contentUnchanged) next.content = newContent;
    if (!metadataUnchanged && metadataProvided) next.metadata = newMetadata as M;

    draft[id] = next;
  });
}

/**
 * Converts a node to a root node by setting its root property to its own ID and removing any parent-child relationships.
 * @param mappings A record mapping node IDs to MessageNode objects.
 * @param id The ID of the node to convert to a root node.
 * @returns A new mappings object (or the original if no change).
 */
export function makeRoot<C = string, M = Record<string, any>>(
  mappings: Readonly<Record<string, MessageNode<C, M>>>,
  id: string
): Record<string, MessageNode<C, M>> {
  const node0 = mappings[id];
  if (!node0) {
    console.warn(`Node with ID: ${id} does not exist.`);
    return mappings as Record<string, MessageNode<C, M>>;
  }

  const newRootId = id;

  return updateMap(mappings, (draft) => {
    const node = draft[id];
    if (!node) return;

    // Detach from parent (but keep child/subtree!)
    if (node.parent) {
      const pId = node.parent;
      const parent = draft[pId];
      if (parent?.child === id) {
        draft[pId] = cloneNode(parent);
        draft[pId]!.child = undefined;
      }

      draft[id] = cloneNode(draft[id]!);
      draft[id]!.parent = undefined;
    }

    // Rewrite root on this node + descendants (branch-aware)
    const seen = new Set<string>();
    const stack = [newRootId];

    while (stack.length) {
      const curId = stack.pop()!;
      if (seen.has(curId)) continue;
      seen.add(curId);

      const cur = draft[curId];
      if (!cur) continue;

      // clone before mutating root
      draft[curId] = cloneNode(cur);
      draft[curId]!.root = newRootId;

      // Follow explicit chain
      if (draft[curId]!.child) stack.push(draft[curId]!.child!);

      // Follow all direct children (branching)
      for (const ch of getChildren(draft as any, curId)) {
        stack.push(ch.id);
      }
    }
  });
}