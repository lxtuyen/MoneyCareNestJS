export function parseBankMail(content: string) {
  // Ví dụ VCB
  const vcbRegex = /So tien GD:\s*([\d,.]+)\s*VND.*Ma GD:\s*(\w+)/i;

  const match = content.match(vcbRegex);

  if (!match) return null;

  return {
    bankName: 'VCB',
    amount: Number(match[1].replace(/,/g, '')),
    transactionCode: match[2],
  };
}
