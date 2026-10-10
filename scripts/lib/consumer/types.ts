import { join } from "node:path";
import { scriptLogger } from "../logger.ts";
import { run } from "../process.ts";
import type { ConsumerFixture } from "./fixture.ts";
import { condition, entries, specifier, write } from "./manifest.ts";

export async function checkTypes(fixture: ConsumerFixture): Promise<void> {
  const core = fixture.directory.includes("-core-");
  const imports: string[] = [];
  for (const manifest of fixture.packages.values())
    for (const [subpath, value] of entries(manifest)) {
      const target = condition(value, "types");
      if (!target || !target.endsWith(".d.ts")) continue;
      if (core && subpath.startsWith("./react")) continue;
      const index = imports.length;
      imports.push(
        `import * as entry${index} from ${JSON.stringify(specifier(manifest, subpath))};\nexport type Entry${index} = typeof entry${index};`,
      );
    }
  const examples = `
import { requestJson, type JsonValue } from "@raypx/client/http";
import { signIn } from "@raypx/client/auth";
import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";
import { parseClientEnv, type ClientEnv } from "@raypx/env/client";
const health: Promise<HealthResponse> = requestJson({path:"/api/health",schema:healthResponseSchema});
const publicEnv: ClientEnv = parseClientEnv({PRIVATE_SECRET:"omitted"});
const body: JsonValue = {items:[1,true,null,"safe"]};
void health; void publicEnv; void body;
signIn({email:"consumer@example.test",password:"consumer-password"});
// @ts-expect-error functions are not a JSON request body
requestJson({path:"/api/example",method:"POST",schema:healthResponseSchema,body:()=>"unsafe"});
// @ts-expect-error sign-in must include a password
signIn({email:"consumer@example.test"});
// @ts-expect-error schema inference must retain the structured response
const wrongResponse: Promise<number> = requestJson({path:"/api/health",schema:healthResponseSchema});
${
  fixture.packages.has("@raypx/storage")
    ? `
import { createStorageInstance, type Storage, type StorageConfig } from "@raypx/storage";
const storageConfig: StorageConfig = {memory:true};
const firstStorage: Storage = createStorageInstance(storageConfig);
const secondStorage: Storage = createStorageInstance({memory:true});
const disposal: Promise<void> = firstStorage.dispose();
void secondStorage; void disposal;
// @ts-expect-error explicit driver selection must use a boolean
createStorageInstance({memory:"true"});
// @ts-expect-error the factory must retain the storage interface
const wrongStorage: number = createStorageInstance({memory:true});
`
    : ""
}
${
  core
    ? ""
    : `
import { Button, Input } from "@raypx/ui/components";
import { useDebouncedValue } from "@raypx/ui/hooks/debounce";
import { ClientProvider, createQueryClient, useHealthCheck } from "@raypx/client/react";
const queryClient = createQueryClient({defaultOptions:{queries:{retry:false}}});
export function ConsumerDisplay(){
 const value: string = useDebouncedValue("search",50);
 const status = useHealthCheck().status;
 // @ts-expect-error debounce must preserve its input type
 const invalid: number = useDebouncedValue("text",50);
 void invalid;
 return <ClientProvider client={queryClient}><Button variant="outline">{status}</Button><Input value={value} readOnly/></ClientProvider>;
}
// @ts-expect-error unknown UI variants must not become any
export const invalidButton = <Button variant="unknown-variant"/>;
`
}
`;
  await write(join(fixture.directory, "types.tsx"), imports.join("\n") + examples);
  for (const mode of ["NodeNext", "Bundler"]) {
    await write(join(fixture.directory, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: mode === "NodeNext" ? "NodeNext" : "ESNext",
        moduleResolution: mode,
        jsx: "react-jsx",
        types: ["node"],
      },
      include: ["types.tsx"],
    });
    await run("bun", ["run", "tsc", "-p", "tsconfig.json"], fixture.directory);
  }
  scriptLogger.success(`Consumer types: ${imports.length} public entries in NodeNext and Bundler`);
}
