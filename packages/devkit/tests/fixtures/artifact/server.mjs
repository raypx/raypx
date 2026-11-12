import { createServer } from "node:http";

createServer((request, response) => {
  response.statusCode = request.url === "/health" ? 200 : 404;
  response.end(process.env.GREETING ?? "");
}).listen(Number(process.env.PORT), process.env.HOST);
