import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { publicProcedure } from "../init";

// Demo data - replace with database queries in production
const todos = [
  { id: 1, name: "Get groceries" },
  { id: 2, name: "Buy a new phone" },
  { id: 3, name: "Finish the project" },
];

/**
 * Todos router - manages todo items
 */
export const todosRouter = {
  list: publicProcedure.query(() => todos),
  add: publicProcedure.input(z.object({ name: z.string().min(1) })).mutation(({ input }) => {
    const newTodo = { id: todos.length + 1, name: input.name };
    todos.push(newTodo);
    return newTodo;
  }),
  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => {
    const index = todos.findIndex((todo) => todo.id === input.id);
    if (index !== -1) {
      todos.splice(index, 1);
    }
    return { success: true };
  }),
} satisfies TRPCRouterRecord;
