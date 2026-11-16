import {
  createAiClient,
  createCompatibleProvider,
  type AssistantMessage,
  type Message,
  type ToolCall,
  type Usage,
} from "@raypx/ai";
import {
  historySearchInstructions,
  historySearchTool,
  prepareHistorySearch,
  recentHistoryStart,
  searchOlderHistory,
  type ModelTurn,
} from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import { createDeploymentModels } from "../../src/conversations/models.js";

// Each policy starts from one synthetic record and receives the same three questions.
// Its actual replies are carried over to subsequent Runs.
const [baseUrl, modelId, lookupMode = "natural"] = Bun.argv.slice(2);
const endpoint = baseUrl ? new URL(baseUrl) : undefined;
if (
  !baseUrl ||
  !modelId ||
  (lookupMode !== "natural" && lookupMode !== "requested" && lookupMode !== "guided") ||
  endpoint?.protocol !== "http:" ||
  endpoint.hostname !== "127.0.0.1" ||
  !endpoint.port
)
  throw new Error(
    "Usage: bun run --cwd apps/api bench:history-context http://127.0.0.1:PORT/v1 MODEL [natural|requested|guided]",
  );

const contextWindow = 8192;
const maxTokens = 512;
const apiKey = "raypx-local-compaction-fixture";
const provider = "local-benchmark";
const cases = [
  {
    name: "recorded identifier",
    subject: "North Depot",
    facts: ["The permanent return code for North Depot is MINT-17."],
    task: "What is the permanent return code for North Depot? Reply with only the code.",
    answer: "MINT-17",
  },
  {
    name: "corrected value",
    subject: "Harbor",
    facts: [
      "The working dispatch lane for Harbor is BLUE-6.",
      "Correction: Harbor dispatch uses OCHRE-2. BLUE-6 is obsolete.",
    ],
    task: "Which dispatch lane is current for Harbor? Reply with only the lane.",
    answer: "OCHRE-2",
  },
  {
    name: "operational constraint",
    subject: "Grove",
    facts: [
      "The Grove checklist: if the manifest is missing, the required state is HOLD. If present, use READY.",
    ],
    task: "For Grove, the manifest is missing. Reply with only the required state.",
    answer: "HOLD",
  },
  {
    name: "exact artifact",
    subject: "South Depot",
    facts: ["South Depot stores the signed handoff as orchard-ledger.csv."],
    task: "What is the exact name of South Depot’s signed handoff file? Reply with only the filename.",
    answer: "orchard-ledger.csv",
  },
  {
    name: "distinct records",
    subject: "North Quay",
    facts: ["The approved North Quay pickup window is WED-11. East Quay uses FRI-09."],
    task: "Which pickup window belongs to North Quay? Reply with only the window code.",
    answer: "WED-11",
  },
  {
    name: "recent correction",
    subject: "Lake Station",
    facts: ["The original printer queue for Lake Station was RIVER-4."],
    recent:
      "Final correction: Lake Station now uses CLOUD-8. Never use the old queue name in reports.",
    task: "What is the current Lake Station printer queue? Reply with only the queue name.",
    answer: "CLOUD-8",
  },
];

const identities = [
  ["RUNE-41", "fir-box.pdf"],
  ["LIME-62", "mooring-plan.pdf"],
  ["IRIS-83", "grove-index.pdf"],
  ["VINE-25", "copper-notes.pdf"],
  ["REED-36", "quay-brief.pdf"],
  ["TIDE-57", "lake-checks.pdf"],
] as const;
type Case = (typeof cases)[number];
type Question = Pick<Case, "task" | "answer">;
const variants = ["original", "summary", "retrieval"] as const;
type Variant = (typeof variants)[number];

function historyFor(item: Case, index: number): ModelTurn["history"] {
  const lines: ModelTurn["history"] = [];
  const [team, file] = identities[index]!;
  const facts: Partial<Record<number, string>> = {
    0: item.facts[0]!,
    2: `${item.subject} escalation team code is ${team}.`,
    4: `${item.subject} supporting evidence file is ${file}.`,
  };
  if (item.facts[1]) facts[7] = item.facts[1];
  function add(role: "user" | "assistant", text: string) {
    lines.push({ role, text, createdAt: new Date(lines.length * 1000).toISOString() });
  }
  for (let round = 0; round < 12; round++) {
    const notes = Array.from({ length: 3 }, (_, noteIndex) => {
      const id = round * 3 + noteIndex + 1;
      return `Inventory note ${id} records inspection of packing shelves, cable tags, storage drawers, spare clips, and transport bins. No action followed.`;
    }).join("\n");
    const fact = facts[round];
    add("user", fact ? `${fact}\n${notes}` : notes);
    add("assistant", `I recorded the inspection details for batch ${round + 1}. ${notes}`);
  }
  add(
    "user",
    item.recent ?? "Close the inspection log. We still need the earlier handoff details.",
  );
  add("assistant", "I can use the earlier record for the handoff.");
  add("user", "Use the last recorded value if a field was corrected.");
  add("assistant", "Understood.");
  add("user", "Keep the handoff response brief.");
  return lines;
}

function questionsFor(item: Case, index: number): Question[] {
  const [team, file] = identities[index]!;
  const questions = [
    item,
    {
      task: `Following up on ${item.subject}, what is its escalation team code? Reply with only the code.`,
      answer: team,
    },
    {
      task: `What is the supporting evidence filename for ${item.subject}? Reply with only the filename.`,
      answer: file,
    },
  ];
  if (lookupMode === "natural") return questions;
  return questions.map((question) => ({
    ...question,
    task: `${question.task} Search older messages for ${item.subject} first using agent_search_history if available. Then give only the requested value.`,
  }));
}

const client = createAiClient({
  providers: [
    createCompatibleProvider({
      id: provider,
      baseUrl,
      api: "openai-completions",
      models: [{ id: modelId, contextWindow, maxTokens }],
    }),
  ],
});
let summaryUsage: Usage[] = [];
let summaryCalls = 0;
const measuredClient = {
  ...client,
  async complete(...args: Parameters<typeof client.complete>) {
    summaryCalls++;
    const result = await client.complete(...args);
    summaryUsage.push(result.usage);
    return result;
  },
};
const models = createDeploymentModels(
  JSON.stringify(
    variants.map((variant) => ({
      modelId: variant,
      provider,
      model: modelId,
      credentialId: "local",
      compactHistory: variant === "summary",
      searchHistory: variant === "retrieval",
    })),
  ),
  JSON.stringify({ local: apiKey }),
  undefined,
  measuredClient,
);

async function runTurn(
  history: ModelTurn["history"],
  question: Question,
  subject: string,
  variant: Variant,
) {
  const id = crypto.randomUUID();
  const run = runSchema.parse({
    id,
    spaceId: id,
    conversationId: id,
    agentId: id,
    trigger: "message",
    messageId: id,
    memberAccountId: "fixture",
    model: { modelId: variant },
    state: "running",
    failureCode: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    firstResponseAt: null,
    finishedAt: null,
  });
  const model = await models.resolve(run);
  const input: ModelTurn = {
    instructions:
      "Answer the final question from the conversation record. If the value is missing and a history search tool is available, look it up before saying UNKNOWN. Give the requested value only.",
    history,
  };
  const end = recentHistoryStart(history);
  const signal = AbortSignal.timeout(120_000);
  summaryUsage = [];
  summaryCalls = 0;
  const started = performance.now();
  const summary = end ? await model.compactHistory?.(input, { start: 0, end }, signal) : undefined;
  if (summary)
    input.history = [
      { role: "user", text: summary, createdAt: history[0]!.createdAt },
      ...history.slice(end),
    ];
  if (end && model.searchHistory) {
    input.instructions = `${input.instructions}\n\n${historySearchInstructions}`;
    input.history = history.slice(end);
    input.tools = [historySearchTool];
  }
  const continuation: Message[] = [];
  const visible: string[] = [];
  let reply = "";
  const turnUsage: Usage[] = [];
  let requests = 0;
  let lookups = 0;
  let failed = false;
  function continueWithTools(result: AssistantMessage, calls: ToolCall[]) {
    if (calls.length > 16 || !input.tools?.length) throw new Error("Tool round limit");
    continuation.push(result);
    for (const call of calls) {
      if (call.name !== historySearchTool.name) throw new Error("Unregistered history tool");
      const prepared = prepareHistorySearch(call);
      continuation.push(searchOlderHistory(history, end, prepared));
      lookups++;
    }
  }
  try {
    const guided = lookupMode === "guided" && Boolean(input.tools?.length);
    if (guided) {
      // Isolate the lookup prompt for a small model. It still produces the native
      // call itself, and the auxiliary request is charged to this turn.
      requests++;
      const result = await model
        .stream(
          {
            instructions: historySearchInstructions,
            history: [
              {
                role: "user",
                text: `Call agent_search_history with query ${subject}. Do not answer yet.`,
                createdAt: history.at(-1)!.createdAt,
              },
            ],
            tools: [historySearchTool],
          },
          signal,
        )
        .result();
      turnUsage.push(result.usage);
      const calls = result.content.filter((part) => part.type === "toolCall");
      if (!calls.length) throw new Error("No native lookup in guided request");
      continueWithTools(result, calls);
    }
    for (let round = guided ? 1 : 0; round <= 8; round++) {
      requests++;
      const result = await model.stream({ ...input, continuation }, signal).result();
      turnUsage.push(result.usage);
      reply = result.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("")
        .trim();
      if (reply) visible.push(reply);
      const calls = result.content.filter((part) => part.type === "toolCall");
      if (!calls.length) break;
      if (round === 8) throw new Error("Tool round limit");
      continueWithTools(result, calls);
    }
  } catch {
    failed = true;
  }
  const usage = [...summaryUsage, ...turnUsage];
  const tokensIn = (entry: Usage) => entry.input + entry.cacheRead + entry.cacheWrite;
  return {
    summaryApplied: Boolean(summary),
    complete: !failed && reply.toLowerCase() === question.answer.toLowerCase(),
    expectedValuePresent: reply.toLowerCase().includes(question.answer.toLowerCase()),
    failed,
    expected: question.answer,
    reply,
    visible,
    lookups,
    requests: summaryCalls + requests,
    summaryCalls,
    usageReports: usage.filter((entry) => entry.totalTokens > 0).length,
    inputTokens: usage.reduce((sum, entry) => sum + tokensIn(entry), 0),
    replyInputTokens: turnUsage.reduce((sum, entry) => sum + tokensIn(entry), 0),
    outputTokens: usage.reduce((sum, entry) => sum + entry.output, 0),
    summaryTokens: summaryUsage.reduce((sum, entry) => sum + entry.totalTokens, 0),
    totalTokens: usage.reduce((sum, entry) => sum + entry.totalTokens, 0),
    durationMs: Math.round(performance.now() - started),
  };
}

async function runCase(item: Case, index: number, variant: Variant) {
  const history = historyFor(item, index);
  const turns = [];
  function append(role: "user" | "assistant", text: string) {
    history.push({ role, text, createdAt: new Date(history.length * 1000).toISOString() });
  }
  for (const [step, question] of questionsFor(item, index).entries()) {
    append("user", question.task);
    const { visible, ...turn } = await runTurn(history, question, item.subject, variant);
    for (const text of visible) append("assistant", text);
    turns.push({ step: step + 1, question: question.task, ...turn });
  }
  return { name: item.name, variant, complete: turns.every((turn) => turn.complete), turns };
}

try {
  await client.complete(
    { provider, model: modelId },
    { messages: [{ role: "user", content: "Say OK.", timestamp: 0 }] },
    { apiKey, env: {}, maxTokens: 4 },
  );
  const results = [];
  for (const [index, item] of cases.entries()) {
    for (let offset = 0; offset < variants.length; offset++) {
      const variant = variants[(index + offset) % variants.length]!;
      results.push(await runCase(item, index, variant));
    }
  }
  console.log(JSON.stringify({ modelId, contextWindow, maxTokens, lookupMode, results }, null, 2));
} finally {
  models.close();
}
