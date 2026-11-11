import path from "node:path";
import { fileURLToPath } from "node:url";
import AutoLoad from "@fastify/autoload";
import fp from "fastify-plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Формы в браузере умеют отправлять только GET и POST, поэтому PATCH и DELETE
// приезжают как POST с параметром _method. Метод подменяется здесь, до
// маршрутизации: обработчики объявлены на настоящие глаголы HTTP.
const allowedMethods = ["HEAD", "PUT", "DELETE", "OPTIONS", "PATCH"];

const rewriteUrl = (req) => {
  if (req.method.toUpperCase() === "POST") {
    const { searchParams } = new URL(req.url, "http://localhost");
    const method = searchParams.get("_method")?.toUpperCase();
    if (method && allowedMethods.includes(method)) {
      req.method = method;
    }
  }

  return req.url;
};

// Опции применяются только при запуске с флагом --options, он прописан
// в командах start и dev.
export const options = {
  logger: true,
  rewriteUrl,
};

// fastify-cli регистрирует этот файл как обычный плагин, а обычный плагин
// инкапсулирован: декоратор db остался бы внутри и не был бы виден корневому
// инстансу, который возвращает fastify-cli/helper в тестах. Обёртка
// fastify-plugin убирает эту границу.
export default fp(async function (fastify, opts) {
  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, "plugins"),
    options: { ...opts },
  });

  await fastify.register(AutoLoad, {
    dir: path.join(__dirname, "routes"),
    options: { ...opts },
  });
});
