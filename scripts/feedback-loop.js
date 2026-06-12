const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../feedback_logs.jsonl');
const summaryOutputPath = path.join(__dirname, '../feedback_summary.json');

// リモートモード:
//   FEEDBACK_API_BASE（例: https://construct-quotation-api.<account>.workers.dev）と
//   ADMIN_KEY を環境変数で指定すると、Worker の /feedback/summary（D1集計）から取得する。
// 未指定の場合は従来どおりローカルの feedback_logs.jsonl を集計する。
const apiBase = process.env.FEEDBACK_API_BASE;
const adminKey = process.env.ADMIN_KEY;

async function fetchRemoteSummary() {
  const url = `${apiBase.replace(/\/$/, '')}/feedback/summary`;
  const res = await fetch(url, {
    headers: { 'X-Admin-Key': adminKey },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Remote summary fetch failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  const summary = (data.summary || []).map(item => ({
    ...item,
    excludeReasons: [...new Set(item.excludeReasons || [])].slice(0, 5),
  }));
  return { summary, sourceLabel: `${url} (${data.totalEvents} events)` };
}

function buildLocalSummary() {
  if (!fs.existsSync(logFilePath)) {
    console.log('No feedback logs found. Run the application and export results to generate logs.');
    console.log('Hint: set FEEDBACK_API_BASE and ADMIN_KEY to aggregate from the deployed Worker (D1) instead.');
    process.exit(0);
  }

  const rawData = fs.readFileSync(logFilePath, 'utf-8');
  const lines = rawData.split('\n').filter(Boolean);

  const stats = {};

  lines.forEach(line => {
    try {
      const entry = JSON.parse(line);
      if (!entry.details || !Array.isArray(entry.details)) return;

      entry.details.forEach(detail => {
        const key = `${detail.finishTriggerId}::${detail.processName}`;
        if (!stats[key]) {
          stats[key] = {
            finishTriggerId: detail.finishTriggerId,
            finishDisplayName: detail.finishDisplayName,
            processName: detail.processName,
            suggestedCount: 0,
            excludedCount: 0,
            excludeReasons: []
          };
        }

        stats[key].suggestedCount++;
        if (detail.isExcluded) {
          stats[key].excludedCount++;
          if (detail.excludeReason) {
            stats[key].excludeReasons.push(detail.excludeReason);
          }
        }
      });
    } catch (e) {
      console.error('Error parsing log line:', e);
    }
  });

  const summary = Object.values(stats).map(item => {
    const exclusionRate = item.suggestedCount > 0 ? (item.excludedCount / item.suggestedCount) : 0;
    return {
      ...item,
      exclusionRate,
      excludeReasons: [...new Set(item.excludeReasons)].slice(0, 5) // Top 5 unique reasons
    };
  });

  return { summary, sourceLabel: `${logFilePath} (${lines.length} logs)` };
}

async function main() {
  const useRemote = Boolean(apiBase && adminKey);
  if (apiBase && !adminKey) {
    console.error('FEEDBACK_API_BASE is set but ADMIN_KEY is missing. Set both to use remote mode.');
    process.exit(1);
  }

  const { summary, sourceLabel } = useRemote ? await fetchRemoteSummary() : buildLocalSummary();

  // Identify items with high exclusion rate (potential false positives in process chain)
  summary.sort((a, b) => b.exclusionRate - a.exclusionRate);

  // Write summary to JSON
  fs.writeFileSync(summaryOutputPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log('=== Feedback Loop Analysis ===');
  console.log(`Source: ${sourceLabel}`);
  console.log(`Summary written to ${summaryOutputPath}\n`);

  console.log('--- High Exclusion Rate Items (Exclusion Rate >= 50%) ---');
  const highExclusions = summary.filter(item => item.exclusionRate >= 0.5);

  if (highExclusions.length === 0) {
    console.log('No items exceed 50% exclusion rate. The dictionary matcher accuracy is well aligned with user choices.');
  } else {
    highExclusions.forEach(item => {
      console.log(`- [${item.finishDisplayName}] ${item.processName}`);
      console.log(`  Exclusion Rate: ${(item.exclusionRate * 100).toFixed(1)}% (${item.excludedCount}/${item.suggestedCount})`);
      if (item.excludeReasons.length > 0) {
        console.log(`  Sample Reasons: ${item.excludeReasons.join(', ')}`);
      }
    });
  }
  console.log('==============================');
}

main().catch(err => {
  console.error('Feedback loop analysis failed:', err.message || err);
  process.exit(1);
});
