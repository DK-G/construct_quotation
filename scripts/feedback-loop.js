const fs = require('fs');
const path = require('path');

const logFilePath = path.join(__dirname, '../feedback_logs.jsonl');
const summaryOutputPath = path.join(__dirname, '../feedback_summary.json');

if (!fs.existsSync(logFilePath)) {
  console.log('No feedback logs found. Run the application and export results to generate logs.');
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

// Compute ratios and identify items with high exclusion rate (potential false positives in process chain)
const summary = Object.values(stats).map(item => {
  const exclusionRate = item.suggestedCount > 0 ? (item.excludedCount / item.suggestedCount) : 0;
  return {
    ...item,
    exclusionRate,
    excludeReasons: [...new Set(item.excludeReasons)].slice(0, 5) // Top 5 unique reasons
  };
}).sort((a, b) => b.exclusionRate - a.exclusionRate);

// Write summary to JSON
fs.writeFileSync(summaryOutputPath, JSON.stringify(summary, null, 2), 'utf-8');

console.log('=== Feedback Loop Analysis ===');
console.log(`Parsed ${lines.length} feedback logs.`);
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
