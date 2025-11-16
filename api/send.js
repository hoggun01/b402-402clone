// api/send.js
// Vercel Serverless Function
// Flow per klik "Send to Relayer":
// - Pakai PK user (dari HTML) untuk kirim approve( SPENDER_B402, 0.1 USDT )
// - Diulang 2-5x (count) ? gas fee ~ jumlah approve

const { ethers } = require("ethers");

// RPC default BSC
const DEFAULT_RPC =
  process.env.RPC_URL_BSC || "https://bsc-dataseed.binance.org";

// USDT BSC (alamat standar)
const USDT_BSC =
  process.env.USDT_BSC || "0x55d398326f99059fF775485246999027B3197955";

// Kontrak B402 (spender USDT, dari datamu)
const SPENDER_B402 =
  process.env.SPENDER_B402 || "0xE1Af7DaEa624bA3B5073f24A6Ea5531434D82d88";

// Amount 0.1 USDT (18 desimal)
const AMOUNT_WEI =
  process.env.AMOUNT_WEI || "100000000000000000"; // 0.1 * 1e18

// ABI minimal ERC-20 (approve)
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
];

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Only POST allowed" });
  }

  try {
    const { privateKey, bearer, count, rpcUrl } = req.body || {};

    if (!privateKey) {
      return res
        .status(400)
        .json({ success: false, error: "privateKey required" });
    }

    // bearer sekarang murni milik user, hanya dicatat/log jika perlu
    console.log("Incoming bearer from user:", bearer || "(empty)");

    // clamp count 2–5
    let n = parseInt(count || "2", 10);
    if (isNaN(n) || n < 2) n = 2;
    if (n > 5) n = 5;

    const rpcUsed = rpcUrl && rpcUrl.length > 0 ? rpcUrl : DEFAULT_RPC;

    const provider = new ethers.providers.JsonRpcProvider(rpcUsed);

    // Wallet user
    let userWallet;
    try {
      userWallet = new ethers.Wallet(privateKey, provider);
    } catch (e) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid user private key" });
    }
    const userAddress = userWallet.address;

    // Kontrak USDT pakai signer user
    const usdt = new ethers.Contract(USDT_BSC, ERC20_ABI, userWallet);
    const amountWeiBN = ethers.BigNumber.from(AMOUNT_WEI);

    const responses = [];

    for (let i = 0; i < n; i++) {
      try {
        const tx = await usdt.approve(SPENDER_B402, amountWeiBN);
        const receipt = await tx.wait(1);

        responses.push({
          index: i + 1,
          status: "ok",
          txHash: tx.hash,
          blockNumber: receipt.blockNumber,
          owner: userAddress,
          spender: SPENDER_B402,
          amount: AMOUNT_WEI,
        });
      } catch (err) {
        responses.push({
          index: i + 1,
          status: "error",
          error: err.message,
        });
        break; // stop kalau error
      }
    }

    return res.status(200).json({
      success: true,
      sessionId: Date.now().toString(),
      rpcUsed,
      responses,
    });
  } catch (err) {
    console.error("send.js error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};
