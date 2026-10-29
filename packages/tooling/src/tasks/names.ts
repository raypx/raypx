export const taskName = (name: string) => `task:${name}`;
export const taskRef = (member: string, name: string) => `${member}#${taskName(name)}`;
