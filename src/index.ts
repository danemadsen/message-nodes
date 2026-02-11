export interface ChatMessage<T = string> {
  id: string;
  role: string;
  content: T;
  root: string | undefined;
  parent?: string | undefined;
  child?: string | undefined; 
  createTime: Date;
  updateTime: Date;
}

/**
 * Retrieves the conversation thread starting from the root message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param root The ID of the root message to start from.
 * @returns An array of ChatMessage objects representing the conversation thread.
 */
export function getConversation<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  root: string
): Array<ChatMessage<T>> {
  const conversation: Array<ChatMessage<T>> = [];
    
  if (mappings[root] && mappings[root].child) {
    let currentNode: ChatMessage<T> | undefined = mappings[mappings[root].child];
    while (currentNode) {
      conversation.push(currentNode);
      if (currentNode.child) {
        currentNode = mappings[currentNode.child];
      } else {
        break;
      }
    }
  }
  
  return conversation;
}

/**
 * Retrieves all direct child messages of a given message ID.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param id The ID of the parent message.
 * @returns An array of ChatMessage objects that are direct children of the specified message ID.
 */
export function getChildren<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): Array<ChatMessage<T>> {
  return Object.values(mappings).filter((msg) => msg.parent === id);
}

/**
 * Moves to the next child message of a given parent message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param parent The ID of the parent message.
 */
export function nextChild<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  parent: string
): void {
  const children = getChildren(mappings, parent);
  const childIndex = children.findIndex((child) => child.id === mappings[parent]?.child);

  if (childIndex === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }

  if (childIndex + 1 >= children.length) {
    console.warn(`No next child available for parent ID: ${parent}`);
    return;
  }

  mappings[parent]!.child = children[childIndex + 1]!.id;
  children[childIndex + 1]!.parent = parent;
}

/**
 * Moves to the previous child message of a given parent message.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param parent The ID of the parent message.
 */
export function lastChild<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  parent: string
): void {
  const children = getChildren(mappings, parent);
  const childIndex = children.findIndex((child) => child.id === mappings[parent]?.child);

  if (childIndex === -1) {
    console.warn(`No child found for parent ID: ${parent}`);
    return;
  }

  if (childIndex - 1 < 0) {
    console.warn(`No previous child available for parent ID: ${parent}`);
    return;
  }

  mappings[parent]!.child = children[childIndex - 1]!.id;
  children[childIndex - 1]!.parent = parent;
}

/**
 * Deletes a message and all of its child messages from the mappings.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param id The ID of the parent message.
 */
export function deleteMessage<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string
): void {
  if (!mappings[id]) {
    console.warn(`Message with ID: ${id} does not exist.`);
    return;
  }

  const children = getChildren<T>(mappings, id);

  for (const child of children) {
    deleteMessage<T>(mappings, child.id);
  }

  delete mappings[id];
}

/**
 * Adds a new message to the mappings with optional parent-child relationships.
 * @param mappings A record mapping message IDs to ChatMessage objects.
 * @param id The unique ID of the new message.
 * @param role The role associated with the message (e.g., "user", "assistant").
 * @param content The content of the message.
 * @param root The ID of the root message in the conversation thread (if applicable).
 * @param parent The ID of the parent message (if applicable).
 * @param child The ID of the child message (if applicable).
 * @param createTime The creation time of the message (defaults to current time).
 * @param updateTime The last update time of the message (defaults to current time).
 */
export function addMessage<T = string>(
  mappings: Record<string, ChatMessage<T>>, 
  id: string,
  role: string,
  content: T,
  root: string | undefined,
  parent: string | undefined,
  child: string | undefined,
  createTime: Date = new Date(),
  updateTime: Date = new Date()
): void {
  if (mappings[id]) {
    console.warn(`Message with ID: ${id} already exists.`);
    return;
  }

  if (root && !mappings[root]) {
    console.warn(`Root message with ID: ${root} does not exist.`);
    return;
  }

  if (parent) {
    if (mappings[parent]) {
      mappings[parent]!.child = id;
    } 
    else {
      console.warn(`Parent message with ID: ${parent} does not exist.`);
      return;
    }
  }

  if (child) {
    if (mappings[child]) {
      mappings[child]!.parent = id;
    } 
    else {
      console.warn(`Child message with ID: ${child} does not exist.`);
      return;
    }
  }

  mappings[id] = {
    id,
    role,
    content,
    root,
    parent,
    child,
    createTime,
    updateTime
  };
}