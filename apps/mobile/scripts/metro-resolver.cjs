const path = require("node:path");

function isRepositorySource(file, repositoryRoot) {
  const relative = path.relative(repositoryRoot, file);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes("node_modules") &&
    /\.tsx?$/.test(file)
  );
}

/** Keep emitted .js specifiers in NodeNext source compatible with Metro. */
module.exports = function withTypeScriptSourceResolution(config, repositoryRoot) {
  const originalResolver = config.resolver?.resolveRequest;
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        const resolve = originalResolver ?? context.resolveRequest;
        try {
          return resolve(context, moduleName, platform);
        } catch (error) {
          if (
            !error?.candidates ||
            !/^\.\.?\/.*\.js$/.test(moduleName) ||
            !isRepositorySource(context.originModulePath, repositoryRoot)
          )
            throw error;
          const source = moduleName.slice(0, -3);
          const candidate = path.resolve(path.dirname(context.originModulePath), source);
          const suffixes = [...(platform ? [`.${platform}`] : []), ".native", ""];
          const exists = ["ts", "tsx"].some((extension) =>
            suffixes.some((suffix) => {
              const file = `${candidate}${suffix}.${extension}`;
              return isRepositorySource(file, repositoryRoot) && context.doesFileExist(file);
            }),
          );
          if (!exists) throw error;
          const resolved = resolve(context, source, platform);
          if (
            resolved.type === "sourceFile" &&
            isRepositorySource(resolved.filePath, repositoryRoot)
          )
            return resolved;
          throw error;
        }
      },
    },
  };
};
