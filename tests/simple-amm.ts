import * as anchor from "@coral-xyz/anchor";
import * as spl from "@solana/spl-token";
import { Program } from "@coral-xyz/anchor";
import { SimpleAmm } from "../target/types/simple_amm";
import assert from "assert";
import { Connection, Transaction } from "@solana/web3.js";

describe("simple-amm", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SimpleAmm as Program<SimpleAmm>;

  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();

  let tokenAMint: anchor.web3.PublicKey;
  let tokenBMint: anchor.web3.PublicKey;

  let aliceTokenAAccount: anchor.web3.PublicKey;
  let bobTokenAAccount: anchor.web3.PublicKey;
  let aliceTokenBAccount: anchor.web3.PublicKey;
  let bobTokenBAccount: anchor.web3.PublicKey;
  let aliceLiquidityTokenAccount: anchor.web3.PublicKey;
  let bobLiquidityTokenAccount: anchor.web3.PublicKey;

  // Constants
  const lpBasisFeePoints = 30;
  const initialTokenMintAmount = 1000_000_000;
  const initialLiquidityAmountA = 10000;
  const initialLiquidityAmountB = 500;

  it("Fund users", async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(alice.publicKey, 1000_000_000),
      "confirmed"
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(bob.publicKey, 1000_000_000),
      "confirmed"
    );

    const aliceUserBalance = await provider.connection.getBalance(
      alice.publicKey
    );
    const bobUserBalance = await provider.connection.getBalance(bob.publicKey);

    assert.strictEqual(1000_000_000, aliceUserBalance);
    assert.strictEqual(1000_000_000, bobUserBalance);
  });

  it("Create mint and token accounts", async () => {
    tokenAMint = await spl.createMint(
      provider.connection,
      alice,
      alice.publicKey,
      null,
      6
    );
    tokenBMint = await spl.createMint(
      provider.connection,
      alice,
      alice.publicKey,
      null,
      6
    );

    aliceTokenAAccount = await spl.createAccount(
      provider.connection,
      alice,
      tokenAMint,
      alice.publicKey
    );
    aliceTokenBAccount = await spl.createAccount(
      provider.connection,
      alice,
      tokenBMint,
      alice.publicKey
    );
    bobTokenAAccount = await spl.createAccount(
      provider.connection,
      bob,
      tokenAMint,
      bob.publicKey
    );
    bobTokenBAccount = await spl.createAccount(
      provider.connection,
      bob,
      tokenBMint,
      bob.publicKey
    );

    await spl.mintTo(
      provider.connection,
      alice,
      tokenAMint,
      aliceTokenAAccount,
      alice.publicKey,
      initialTokenMintAmount,
      [alice]
    );
    await spl.mintTo(
      provider.connection,
      alice,
      tokenBMint,
      aliceTokenBAccount,
      alice.publicKey,
      initialTokenMintAmount,
      [alice]
    );
    await spl.mintTo(
      provider.connection,
      bob,
      tokenAMint,
      bobTokenAAccount,
      alice.publicKey,
      initialTokenMintAmount,
      [alice]
    );
    await spl.mintTo(
      provider.connection,
      bob,
      tokenBMint,
      bobTokenBAccount,
      alice.publicKey,
      initialTokenMintAmount,
      [alice]
    );

    const aliceTokenAAccountUpdated = await spl.getAccount(
      provider.connection,
      aliceTokenAAccount
    );
    const aliceTokenBAccountUpdated = await spl.getAccount(
      provider.connection,
      aliceTokenBAccount
    );
    const bobTokenAAccountUpdated = await spl.getAccount(
      provider.connection,
      bobTokenBAccount
    );
    const bobTokenBAccountUpdated = await spl.getAccount(
      provider.connection,
      bobTokenBAccount
    );

    assert.equal(initialTokenMintAmount, aliceTokenAAccountUpdated.amount);
    assert.equal(initialTokenMintAmount, aliceTokenBAccountUpdated.amount);
    assert.equal(initialTokenMintAmount, bobTokenAAccountUpdated.amount);
    assert.equal(initialTokenMintAmount, bobTokenBAccountUpdated.amount);
  });

  // PDA getter methods

  const getAmmStatePDA = () => {
    const [ammStatePDA, ammStateBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("amm_state")],
        program.programId
      );
    return { ammStatePDA, ammStateBump };
  };

  const getTokenPoolPDA = (
    tokenAMint: anchor.web3.PublicKey,
    tokenBMint: anchor.web3.PublicKey
  ) => {
    const [tokenPoolPDA, tokenPoolBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("pool"), tokenAMint.toBuffer(), tokenBMint.toBuffer()],
        program.programId
      );
    return { tokenPoolPDA, tokenPoolBump };
  };

  const getLiquidityTokenMintPDA = (
    tokenAMint: anchor.web3.PublicKey,
    tokenBMint: anchor.web3.PublicKey
  ) => {
    const [liquidityTokenMintPDA, liquidityTokenMintBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [
          Buffer.from("liquidity_token"),
          tokenAMint.toBuffer(),
          tokenBMint.toBuffer(),
        ],
        program.programId
      );
    return { liquidityTokenMintPDA, liquidityTokenMintBump };
  };

  it("initialize AMM!", async () => {
    const { ammStatePDA } = getAmmStatePDA();

    const tx = await program.methods
      .initializeAmm(lpBasisFeePoints)
      .accounts({
        authority: alice.publicKey,
        ammState: ammStatePDA,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([alice])
      .rpc();

    console.log("Your transaction signature", tx);
  });

  it("Create a token pair", async () => {
    const { ammStatePDA } = getAmmStatePDA();
    const { tokenPoolPDA: tokenAPoolPDA, tokenPoolBump: tokenAPoolBump } =
      getTokenPoolPDA(tokenAMint, tokenBMint);
    const { tokenPoolPDA: tokenBPoolPDA, tokenPoolBump: tokenBPoolBump } =
      getTokenPoolPDA(tokenBMint, tokenAMint);
    const { liquidityTokenMintPDA, liquidityTokenMintBump } =
      getLiquidityTokenMintPDA(tokenAMint, tokenBMint);

    bobLiquidityTokenAccount = await spl.getAssociatedTokenAddress(
      liquidityTokenMintPDA,
      bob.publicKey
    );

    try {
      const tx = await program.methods
        .addLiquidity(
          liquidityTokenMintBump,
          new anchor.BN(initialLiquidityAmountA), // amount a desired
          new anchor.BN(initialLiquidityAmountB), // amount b desired
          new anchor.BN(initialLiquidityAmountA), // amount a minimum
          new anchor.BN(initialLiquidityAmountB) // amount b minimum
        )
        .accounts({
          liquidityProvider: bob.publicKey,
          ammState: ammStatePDA,
          liquidityTokenMint: liquidityTokenMintPDA,
          lpTokenAccount: bobLiquidityTokenAccount,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAAccount: bobTokenAAccount,
          tokenBAccount: bobTokenBAccount,
          tokenAPool: tokenAPoolPDA,
          tokenBPool: tokenBPoolPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([bob])
        .rpc();

      const lpTokenToBeMinted = Math.floor(
        Math.sqrt(initialLiquidityAmountA * initialLiquidityAmountB)
      );

      let bobLiquidityTokenAccountUpdated = await spl.getAccount(
        provider.connection,
        bobLiquidityTokenAccount
      );
      console.log("In 1 tx", bobLiquidityTokenAccountUpdated.amount);
      assert.equal(bobLiquidityTokenAccountUpdated.amount, lpTokenToBeMinted);

      const tx1 = await program.methods
        .addLiquidity(
          liquidityTokenMintBump,
          new anchor.BN(initialLiquidityAmountA), // amount a desired
          new anchor.BN(initialLiquidityAmountB - 200), // amount b desired
          new anchor.BN(initialLiquidityAmountA - 5000), // amount a minimum
          new anchor.BN(initialLiquidityAmountB - 200) // amount b minimum
        )
        .accounts({
          liquidityProvider: bob.publicKey,
          ammState: ammStatePDA,
          liquidityTokenMint: liquidityTokenMintPDA,
          lpTokenAccount: bobLiquidityTokenAccount,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAAccount: bobTokenAAccount,
          tokenBAccount: bobTokenBAccount,
          tokenAPool: tokenAPoolPDA,
          tokenBPool: tokenBPoolPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([bob])
        .rpc();
      bobLiquidityTokenAccountUpdated = await spl.getAccount(
        provider.connection,
        bobLiquidityTokenAccount
      );
      console.log("In 2 tx", bobLiquidityTokenAccountUpdated.amount);
    } catch (e) {
      console.log("this is error in add liqudity", e);
    }
  });

  it("Swap token for a token", async () => {
    const { ammStatePDA } = getAmmStatePDA();
    const { tokenPoolPDA: tokenAPoolPDA, tokenPoolBump: tokenAPoolBump } =
      getTokenPoolPDA(tokenAMint, tokenBMint);
    const { tokenPoolPDA: tokenBPoolPDA, tokenPoolBump: tokenBPoolBump } =
      getTokenPoolPDA(tokenBMint, tokenAMint);
    const amountIn = 2;
    try {
      let aliceAccountABeforeSwap = await spl.getAccount(
        provider.connection,
        aliceTokenAAccount
      );
      let aliceAccountBBeforeSwap = await spl.getAccount(
        provider.connection,
        aliceTokenBAccount
      );
      const tx = await program.methods
        .swapTokenForToken(
          tokenAPoolBump,
          tokenBMint,
          new anchor.BN(amountIn),
          new anchor.BN(1)
        )
        .accounts({
          trader: alice.publicKey,
          ammState: ammStatePDA,
          tokenAMint: tokenAMint,
          tokenBMint: tokenBMint,
          tokenAAccount: aliceTokenAAccount,
          tokenBAccount: aliceTokenBAccount,
          tokenAPool: tokenAPoolPDA,
          tokenBPool: tokenBPoolPDA,
          tokenProgram: spl.TOKEN_PROGRAM_ID,
          associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([alice])
        .rpc();

      let tokenAReserves = (
        await spl.getAccount(provider.connection, tokenAPoolPDA)
      ).amount;
      let tokenBReserves = (
        await spl.getAccount(provider.connection, tokenBPoolPDA)
      ).amount;

      let amountInWithFee = amountIn * (10000 - lpBasisFeePoints);
      let numerator = amountInWithFee * Number(tokenAReserves);
      let denominator = Number(tokenBReserves) * 10000 + amountInWithFee;
      let amountOut = Math.floor(numerator / denominator);

      let aliceAccountAAfterSwap = await spl.getAccount(
        provider.connection,
        aliceTokenAAccount
      );
      let aliceAccountBAfterSwap = await spl.getAccount(
        provider.connection,
        aliceTokenBAccount
      );
      assert.equal(
        Number(aliceAccountAAfterSwap.amount) -
          Number(aliceAccountABeforeSwap.amount),
        amountOut
      );
      assert.equal(
        Number(aliceAccountBBeforeSwap.amount) -
          Number(aliceAccountBAfterSwap.amount),
        amountIn
      );
    } catch (error) {
      console.log("This is error in swap token for token", error);
    }
  });

  it("Remove liquditiy", async () => {
    const { ammStatePDA } = getAmmStatePDA();
    const { tokenPoolPDA: tokenAPoolPDA, tokenPoolBump: tokenAPoolBump } =
      getTokenPoolPDA(tokenAMint, tokenBMint);
    const { tokenPoolPDA: tokenBPoolPDA, tokenPoolBump: tokenBPoolBump } =
      getTokenPoolPDA(tokenBMint, tokenAMint);
    const { liquidityTokenMintPDA, liquidityTokenMintBump } =
      getLiquidityTokenMintPDA(tokenAMint, tokenBMint);

    bobLiquidityTokenAccount = await spl.getAssociatedTokenAddress(
      liquidityTokenMintPDA,
      bob.publicKey
    ); 

    const amountToLiquidate = 1000;

    let bobLiquidityTokenAccountBefore = await spl.getAccount(
      provider.connection,
      bobLiquidityTokenAccount
    );
    
    try{
    const tx = await program.methods
    .removeLiquidity(
      tokenAPoolBump,
      tokenBPoolBump,
      liquidityTokenMintBump,
      new anchor.BN(amountToLiquidate),
      new anchor.BN(1), // amount a desired
      new anchor.BN(1), // amount b desired
    )
    .accounts({
      liquidityProvider: bob.publicKey,
      ammState: ammStatePDA,
      liquidityTokenMint: liquidityTokenMintPDA,
      lpTokenAccount: bobLiquidityTokenAccount,
      tokenAMint: tokenAMint,
      tokenBMint: tokenBMint,
      tokenAAccount: bobTokenAAccount,
      tokenBAccount: bobTokenBAccount,
      tokenAPool: tokenAPoolPDA,
      tokenBPool: tokenBPoolPDA,
      tokenProgram: spl.TOKEN_PROGRAM_ID,
      associatedTokenProgram: spl.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .signers([bob])
    .rpc();


    let bobLiquidityTokenAccountAfter = await spl.getAccount(
      provider.connection,
      bobLiquidityTokenAccount
    );

    assert.equal(Number(bobLiquidityTokenAccountBefore.amount) - Number(bobLiquidityTokenAccountAfter.amount), amountToLiquidate);
    } catch(e) {
      console.log("This is error in remove liquidity", e);
    }

  })

});
