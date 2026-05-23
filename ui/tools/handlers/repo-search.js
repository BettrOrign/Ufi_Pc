import { safeFetch, wrapHandler } from './shared.js';

export const handleRepoSearch = wrapHandler(async (args) => {
  const { name, limit } = args;

  if (!name) {
    return { error: 'Search query "name" is required' };
  }

  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(name)}+created:>2015-01-01&sort=stars&order=desc`;

  const result = await safeFetch(url, {
    headers: { "User-Agent": "Ufi-Assistant" },
  }, 15000); // 15s timeout for GitHub API

  if (!result.ok) {
    return { error: `GitHub search failed: ${result.error}` };
  }

  const data = result.data;
  const repos = (data.items || []).slice(0, limit || 5).map((repo) => ({
    Name: repo.full_name,
    Description: repo.description
      ? repo.description.slice(0, 80) +
        (repo.description.length > 80 ? "..." : "")
      : "(no description)",
    Stars: repo.stargazers_count || 0,
    Language: repo.language || "N/A",
    Url: repo.html_url,
  }));

  return {
    repos,
    resultCount: repos.length,
  };
});
