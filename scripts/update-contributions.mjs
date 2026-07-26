/**
 * Regenerates the Open Source Contributions table in README.md.
 *
 * Lists merged pull requests authored by USERNAME in repositories they do not
 * own, filtered to projects with at least MIN_STARS stars so that work repos
 * and small collaborations are not presented as open source contributions.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const USERNAME = process.env.GH_USERNAME ?? 'ademola-emmanuel';
const MIN_STARS = Number(process.env.MIN_STARS ?? 100);
const README = new URL('../README.md', import.meta.url);

const START = '<!-- OSS-CONTRIBUTIONS:START -->';
const END = '<!-- OSS-CONTRIBUTIONS:END -->';

const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': `${USERNAME}-profile-readme`,
    ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

async function api(path) {
    const response = await fetch(`https://api.github.com/${path}`, { headers });

    if (! response.ok) {
        throw new Error(`GitHub API ${response.status} for ${path}: ${await response.text()}`);
    }

    return response.json();
}

/** Drop branch prefixes such as "[5.x] " that mean nothing outside the repo. */
function cleanTitle(title) {
    return title.replace(/^\s*\[[^\]]+\]\s*/, '').trim();
}

const query = encodeURIComponent(`is:pr author:${USERNAME} is:merged -user:${USERNAME}`);
const { items = [] } = await api(`search/issues?q=${query}&per_page=100`);

// Look up each repository once, so the star filter costs one call per repo.
const repoNames = [...new Set(items.map((item) => item.repository_url.split('/').slice(-2).join('/')))];
const repos = new Map();

for (const name of repoNames) {
    try {
        const repo = await api(`repos/${name}`);
        repos.set(name, { stars: repo.stargazers_count, url: repo.html_url });
    } catch (error) {
        console.warn(`Skipping ${name}: ${error.message}`);
    }
}

const contributions = items
    .map((item) => {
        const name = item.repository_url.split('/').slice(-2).join('/');

        return { name, repo: repos.get(name), number: item.number, title: cleanTitle(item.title), url: item.html_url };
    })
    .filter((contribution) => contribution.repo && contribution.repo.stars >= MIN_STARS)
    .sort((a, b) => b.repo.stars - a.repo.stars || b.number - a.number);

const table = contributions.length
    ? [
        '| Project | Contribution |',
        '| --- | --- |',
        ...contributions.map(
            ({ name, repo, number, title, url }) => `| **[${name}](${repo.url})** | [#${number}](${url}) ${title} |`,
        ),
    ].join('\n')
    : '_No merged contributions to show yet._';

const readme = readFileSync(README, 'utf8');
const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);

if (! pattern.test(readme)) {
    throw new Error(`Could not find the ${START} / ${END} markers in README.md`);
}

writeFileSync(README, readme.replace(pattern, `${START}\n\n${table}\n\n${END}`));

console.log(`Wrote ${contributions.length} contribution(s) from ${repoNames.length} repo(s) checked.`);
