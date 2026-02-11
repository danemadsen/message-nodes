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