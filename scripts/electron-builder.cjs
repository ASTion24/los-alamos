const { dependencies = {} } = require("../package.json");

module.exports = async function beforeBuild() {
  if (Object.keys(dependencies).length > 0) {
    throw new Error(
      "The package-manager-free build hook is only valid while package.json has no production dependencies."
    );
  }

  // Main, preload, and renderer code are bundled into out/ by electron-vite.
  return false;
};
