/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-no-outer-layers",
      comment: "Domain must not depend on outer layers.",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: "^src/(application|features|adapters|store|app|components|shared)/",
      },
    },
    {
      name: "domain-no-runtime-libraries",
      comment: "Domain must stay free of framework and runtime libraries.",
      severity: "error",
      from: { path: "^src/domain/" },
      to: {
        path: "node_modules/(react|react-dom|next|vexflow|tone|zod|idb|dexie|zustand|@supabase)",
      },
    },
    {
      name: "application-no-adapters",
      comment: "Application depends on ports, never on concrete adapters.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "^src/adapters/" },
    },
    {
      name: "application-no-react",
      comment: "Application must not depend on React or Next.",
      severity: "error",
      from: { path: "^src/application/" },
      to: { path: "node_modules/(react|react-dom|next)" },
    },
    {
      name: "adapters-no-features",
      comment: "Adapters must not depend on feature UI modules.",
      severity: "error",
      from: { path: "^src/adapters/" },
      to: { path: "^src/features/" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies are forbidden.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    exclude: { path: "(\\.test\\.(ts|tsx)$|^tests/)" },
  },
};
