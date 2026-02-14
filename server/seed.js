const DeveloperAgent = require("./agents/developer-agent");

console.log("Seeding database with a sample roadmap...");

const result = DeveloperAgent.execute("generate_roadmap", {
  title: "SaaS Product Launch",
  description: "Full-stack SaaS application with user auth, billing, and dashboard",
  type: "webapp",
});

console.log(`Created roadmap: "${result.title}" with ${result.milestones.length} milestones`);
for (const m of result.milestones) {
  console.log(`  - ${m.title} (${m.tasks.length} tasks)`);
}
console.log("Seed complete.");
