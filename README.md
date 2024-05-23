# solana-uniswapV2
This is a simple implementation of UniswapV2 without the oracle regulation on Solana

This contract uses the constant product formula ( x * y = k ) for the pools.

## How it works
Unlike the orderbooks which is used in the traditional finance markets, this contract uses automatic market makers (AMM). The core principle that differentiates an automated market maker from a traditional centralized order book is that the former runs permissionless code on the blockchain allowing anyone to participate. 

Suppose we have a pool of WSOL/USDC. WSOL is wrapped Solana and USDC is a stablecoin pegged to the US dollar. So the pool contains the reserves of both USDC and WSOL as shown in image below.
<img width="855" alt="Screenshot 2023-06-18 at 4 39 48 PM" src="https://github.com/dhruvja/solana-uniswapV2/assets/62325417/4453e765-9ae0-495c-afe6-f9be7c1e2028">

So when you are buying USDC with WSOL, u send WSOL to the pool and hence increase the reserves of WSOL for which u get USDC in return which results in decreasing the reserves of USDC. 
<img width="852" alt="Screenshot 2023-06-18 at 4 39 52 PM" src="https://github.com/dhruvja/solana-uniswapV2/assets/62325417/706ca5f3-26ce-41cd-9a0e-76783cc70656">

For example:
```
If the reserves have 
100 WSOL - x
1500 USDC - y

then the constant product is x * y = k (150000)

If i want to buy 20 USDC, i need to send dx amount of WSOL
(x + dx) * (y - dy ) = k
we know that: x = 100, y = 1500, k = 150000, dy = 20
(100 + dx) * ( 1500 - 20 ) = 150000
(100 + dx) = 150000 / (1480)
100 + dx = 101.351
dx = 1.351

So i need to send 1.351 WSOL to receive 20 USDC.
```


## Methods

The contract contains 4 methods:

- Initialize AMM: This method would set an authority for the program and set the fees for the liquidity providers. Though the fees for liquidity providers is hard coded into the contract.
