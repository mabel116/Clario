export function suggestNextInvoiceNumber(existingNumbers: string[]): string {
  if (!existingNumbers || existingNumbers.length === 0) {
    return 'INV-0001';
  }

  let maxVal = -1;
  let chosenPrefix = 'INV-';
  let chosenPadding = 4;

  for (const num of existingNumbers) {
    if (!num) continue;
    const match = num.match(/^(.*?)(\d+)$/);
    if (!match) continue;

    const prefix = match[1];
    const suffixStr = match[2];
    const val = parseInt(suffixStr, 10);

    if (val > maxVal) {
      maxVal = val;
      chosenPrefix = prefix;
      chosenPadding = suffixStr.length;
    }
  }

  if (maxVal === -1) {
    return 'INV-0001';
  }

  const nextVal = maxVal + 1;
  let nextSuffix = String(nextVal);
  while (nextSuffix.length < chosenPadding) {
    nextSuffix = '0' + nextSuffix;
  }

  return chosenPrefix + nextSuffix;
}
