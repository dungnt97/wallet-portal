/**
 * Semantic Release Configuration — wallet-portal apps
 *
 * STATUS: DISABLED FOR MVP
 *
 * Semantic-release is intentionally not active for the wallet-portal application
 * packages during MVP phase. Reasons:
 *   - Private repository: no npm publish or GitHub releases needed yet
 *   - Version tagging will be done manually (git tag) until post-MVP
 *   - The existing .releaserc.cjs is for the claudekit tooling package only
 *
 * To enable after MVP:
 *   1. Make repository public (or configure private npm registry)
 *   2. Set GH_TOKEN and NPM_TOKEN in GitHub Actions secrets
 *   3. Uncomment the module.exports block below
 *   4. Add "semantic-release" step to deploy-prod.yml
 *
 * Intended config (post-MVP):
 */

// module.exports = {
//   branches: ['main'],
//   tagFormat: 'app-v${version}',
//   plugins: [
//     ['@semantic-release/commit-analyzer', {
//       preset: 'conventionalcommits',
//       releaseRules: [
//         { type: 'feat', release: 'minor' },
//         { type: 'fix', release: 'patch' },
//         { type: 'perf', release: 'patch' },
//         { breaking: true, release: 'major' },
//       ],
//     }],
//     '@semantic-release/release-notes-generator',
//     ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
//     ['@semantic-release/git', {
//       assets: ['CHANGELOG.md'],
//       message: 'chore(release): ${nextRelease.version} [skip ci]',
//     }],
//     '@semantic-release/github',
//   ],
// };
