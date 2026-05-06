const CODE_VERSION = "RUN_WEEKLY_SCOUT_TEST_1";

export default async function handler(req, res) {
  return res.status(200).json({
    success: true,
    code_version: CODE_VERSION,
    message: "Vercel is running the correct run-weekly-scout.js file"
  });
}
