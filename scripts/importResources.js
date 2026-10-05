const fs = require("fs");
const path = require("path");

const TARGET_PROJECT = "mindbridge-be753";
const RESOURCE_FILE = path.join(__dirname, "data", "resources.json");

function readResources() {
  const resources = JSON.parse(fs.readFileSync(RESOURCE_FILE, "utf8"));
  if (!Array.isArray(resources) || resources.length === 0) {
    throw new Error("The resource catalog must be a non-empty JSON array.");
  }

  const ids = new Set();
  for (const [index, resource] of resources.entries()) {
    const row = index + 1;
    if (!resource || typeof resource !== "object") {
      throw new Error(`Resource row ${row} must be an object.`);
    }
    if (typeof resource.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(resource.id)) {
      throw new Error(`Resource row ${row} has an invalid id.`);
    }
    if (ids.has(resource.id)) {
      throw new Error(`Duplicate resource id: ${resource.id}`);
    }
    ids.add(resource.id);

    for (const field of ["title", "category", "url"]) {
      if (typeof resource[field] !== "string" || !resource[field].trim()) {
        throw new Error(`Resource ${resource.id} is missing ${field}.`);
      }
    }
    if (!resource.context && !resource.summary) {
      throw new Error(`Resource ${resource.id} needs context or summary text.`);
    }
    const url = new URL(resource.url);
    if (url.protocol !== "https:") {
      throw new Error(`Resource ${resource.id} must use an https URL.`);
    }
    if (resource.tags !== undefined && typeof resource.tags !== "string" && !Array.isArray(resource.tags)) {
      throw new Error(`Resource ${resource.id} has invalid tags.`);
    }
  }

  return resources;
}

function normalizeTags(tags) {
  const values = Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(/[,;]/) : [];
  return [...new Set(values.filter((tag) => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean))];
}

async function upsertResources(resources) {
  const admin = require("firebase-admin");
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "serviceAccountKey.json");
  let credential;

  if (fs.existsSync(keyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    if (serviceAccount.project_id && serviceAccount.project_id !== TARGET_PROJECT) {
      throw new Error(`Credentials target ${serviceAccount.project_id}, not ${TARGET_PROJECT}.`);
    }
    credential = admin.credential.cert(serviceAccount);
  } else {
    credential = admin.credential.applicationDefault();
  }

  const app = admin.initializeApp({ credential, projectId: TARGET_PROJECT });
  try {
    const db = admin.firestore(app);
    const refs = resources.map((resource) => db.collection("resources").doc(resource.id));
    const existing = await db.getAll(...refs);
    const batch = db.batch();

    resources.forEach((resource, index) => {
      const snapshot = existing[index];
      const context = (resource.context || resource.summary).trim();
      const data = {
        title: resource.title.trim(),
        description: context,
        category: resource.category.trim(),
        content: resource.content || null,
        url: resource.url.trim(),
        tags: normalizeTags(resource.tags),
        published: true,
        context,
        time: resource.time || null,
        createdAt: snapshot.exists && snapshot.get("createdAt")
          ? snapshot.get("createdAt")
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      batch.set(refs[index], data, { merge: true });
    });

    await batch.commit();
  } finally {
    await app.delete();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const projectArg = args.find((arg) => arg.startsWith("--project="));
  const project = projectArg && projectArg.slice("--project=".length);
  const apply = args.includes("--apply");

  if (args.includes("--help")) {
    console.log(`Dry-run: node scripts/importResources.js --project=${TARGET_PROJECT}`);
    console.log(`Write:    node scripts/importResources.js --project=${TARGET_PROJECT} --apply`);
    return;
  }
  if (project !== TARGET_PROJECT) {
    throw new Error(`Pass --project=${TARGET_PROJECT} to confirm the target project.`);
  }

  const resources = readResources();
  if (!apply) {
    console.log(`Validated ${resources.length} resources for ${TARGET_PROJECT}; dry-run only, no Firestore writes.`);
    console.log("Add --apply to upsert these stable IDs as published resources.");
    return;
  }

  await upsertResources(resources);
  console.log(`Upserted ${resources.length} published resources to ${TARGET_PROJECT}; unrelated documents were not changed.`);
}

main().catch((error) => {
  console.error(`Resource import failed: ${error.message}`);
  process.exitCode = 1;
});
