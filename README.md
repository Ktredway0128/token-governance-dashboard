# ERC-20 TOKEN STAKING DASHBOARD

[![Verified on Etherscan](https://img.shields.io/badge/Etherscan-Verified-brightgreen)](https://sepolia.etherscan.io/address/0x0823D964ECC9ed0975761F0D08Ac34F21B936D04#code)

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![React](https://img.shields.io/badge/React-18-blue)
![Ethers.js](https://img.shields.io/badge/Ethers.js-5.8-purple)
![Network](https://img.shields.io/badge/Network-Sepolia-green)

Built by [Tredway Development](https://kyle-tredway-portfolio.netlify.app/) — professional Solidity smart contract packages for Web3 companies.

A production-ready React frontend for interacting with a deployed ERC-20 token staking rewards contract.

> ⚠️ This dashboard is connected to the Sepolia test network for demonstration purposes only.
> These contracts have not been professionally audited. A full security audit is strongly recommended before any mainnet deployment.

This project demonstrates the full lifecycle of a token staking management dashboard including:

- Wallet connection and network validation
- Real-time staking data loaded from the blockchain
- Live APY calculation based on current total staked
- Reward period countdown timer
- Staking and unstaking with MetaMask approval flow
- Real-time reward accumulation tracking
- Role-based admin controls
- Transaction feedback with Etherscan verification

The repository represents the frontend layer of an ERC-20 Token Staking package, designed to work alongside the ERC-20 Token Launch Contract as part of the full infrastructure suite.


## PROJECT GOALS

The purpose of this project is to demonstrate how a modern token staking dashboard should be designed for real-world use.

The dashboard includes common features required by token staking interfaces:

- Live staking data loaded from the blockchain
- Dynamic APY that updates as total staked changes
- Wallet-based role detection
- Protected admin functions
- Live countdown timer showing exact time remaining in the reward period
- Pool share progress bar showing the connected wallet's percentage of total staked
- User-friendly transaction status and error handling
- Etherscan transaction verification

These patterns are widely used in production Web3 applications.


## DASHBOARD FEATURES

### WALLET CONNECTION

The dashboard connects to MetaMask and automatically detects the connected wallet's roles.
A network check ensures the user is on the correct chain before connecting.
The UI refreshes automatically when the wallet is switched inside MetaMask.

### LIVE STAKING DATA

On connection, the dashboard loads the following data directly from the contract:

- Total Staked — tokens currently staked across all wallets
- Your Stake — tokens staked by the connected wallet
- Your Rewards — rewards earned and available to claim
- Current APY — annualized yield calculated from the reward rate and total staked
- Total Period Rewards — total reward pool for the current reward period

### REWARD PERIOD CARD

The reward period card shows the current period state:

- Status — Active with live countdown or Ended
- End Date — when the current reward period closes

### MY STAKING POSITION

After staking, the My Staking Position card appears showing the connected wallet's full status:

- Your Pool Share — visual progress bar showing percentage of total staked
- Staked — tokens currently staked by this wallet
- Earned Rewards — rewards accumulated so far
- Pool Share — percentage of the total staking pool

### STAKE TOKENS

Any whitelisted wallet can stake tokens during an active reward period. Staking requires two MetaMask confirmations — one to approve the token spend and one to stake. The stake button is disabled when the contract is paused or no active reward period exists.

### CLAIM REWARDS

Stakers can claim their accumulated rewards at any time. Rewards accumulate indefinitely and never expire — they can be claimed after the reward period ends. The claim button is disabled when there are no rewards to claim.

### UNSTAKE TOKENS

Stakers can unstake any amount at any time regardless of the reward period status. Unstaking is never blocked — only staking is affected by pause and period state. This protects stakers and ensures they always maintain access to their principal.

### UNSTAKE AND CLAIM ALL

A convenience function that unstakes the full balance and claims all pending rewards in a single transaction.

### ROLE-BASED ADMIN PANEL

The admin panel is only visible to wallets holding the ADMIN_ROLE. Non-admin wallets see only their own staking position.

Admin functions include:

| Function | Description |
|----------|-------------|
| Set Reward Period Duration | Configure the duration in days — only callable when no active period |
| Start Reward Period | Fund the reward pool and start distributing rewards |
| Pause / Unpause Staking | Temporarily halt or resume new stakes |
| Recover Accidentally Sent Tokens | Emergency token recovery — cannot recover staking or reward tokens |

### SET REWARD PERIOD DURATION

The admin sets the duration in days before starting a new reward period. This function is only available when no active period is running. The current period duration is displayed below the input.

### START REWARD PERIOD

The admin funds the reward pool by entering a total reward amount and confirming two transactions — one to approve the token transfer and one to start the period. The reward rate is calculated automatically as total rewards divided by duration in seconds.

### PAUSE / UNPAUSE

Staking can be paused at any time to temporarily halt new stakes. Unstaking and reward claiming always remain available — pausing never blocks exits. The button turns green when paused to resume and orange when active to pause.

### TRANSACTION FEEDBACK

Every action triggers a color-coded status bar with a loading spinner:

| Action | Status Color |
|--------|-------------|
| Staking Tokens | Sky Blue |
| Unstaking Tokens | Orange |
| Claiming Rewards | Sky Blue |
| Admin Actions | Sky Blue |
| Success | Bright Green |
| Error | Red |

On success a clickable Etherscan link appears for immediate transaction verification.

### ERROR HANDLING

User-friendly error messages are displayed for common failure cases:

- Transaction rejected in MetaMask
- Insufficient funds
- Amount must be greater than 0
- Insufficient staked balance
- Previous reward period has not finished yet
- Reward period duration has not been set
- Cannot change period while current period is active
- Cannot recover staking or reward tokens
- General transaction failure


## TECHNOLOGY STACK

This project was built using the following tools:

- React – Frontend framework
- Ethers.js – Contract interaction library
- MetaMask – Wallet provider
- Alchemy – Ethereum RPC provider for reads
- Tailwind CSS – Utility-first styling
- Sepolia Test Network – Deployment environment


## PROJECT STRUCTURE

```
src/
    App.js
    App.css
    index.js
    contracts/
        TokenStaking.json
        sepolia.json

public/
    index.html

.env
```

### APP.JS

Contains all wallet connection logic, contract interaction, and UI rendering.

### ENV

Contains the Alchemy RPC URL used for all read operations.


## INSTALLATION

### CLONE THE REPOSITORY:

```bash
git clone https://github.com/Ktredway0128/erc20-staking-dashboard
cd erc20-staking-dashboard
```

### INSTALL DEPENDENCIES:

```bash
npm install
```

### START THE DEVELOPMENT SERVER:

```bash
npm start
```


## ENVIRONMENT SETUP

Create a `.env` file in the root directory:

```
REACT_APP_ALCHEMY_URL=YOUR_SEPOLIA_ALCHEMY_URL
```

This value allows the dashboard to:

- Read staking data directly from the blockchain via Alchemy
- Bypass MetaMask's RPC for all read operations


## HOW TO USE

### CONNECTING YOUR WALLET

1. Make sure MetaMask is installed in your browser
2. Switch MetaMask to the **Sepolia** test network
3. Click **Connect Wallet**
4. Approve the connection in MetaMask

### STAKING TOKENS

1. Connect your wallet during an active reward period
2. Enter the amount of STK tokens to stake
3. Click **Stake**
4. Confirm the token approval transaction in MetaMask
5. Confirm the stake transaction in MetaMask
6. Your staking position card will appear with your pool share and earned rewards

### CLAIMING REWARDS

1. Connect with your staking wallet
2. Click **Claim Rewards** when rewards are available
3. Confirm the transaction in MetaMask
4. Rewards are sent directly to your wallet

### UNSTAKING TOKENS

1. Connect with your staking wallet
2. Enter an amount to unstake or use **Unstake & Claim All** to exit your full position
3. Confirm the transaction in MetaMask
4. Tokens are returned to your wallet immediately

### STARTING A REWARD PERIOD (Admin Only)

1. Connect with the admin wallet
2. Set the reward period duration in days using **Set Reward Period Duration**
3. Enter the total reward amount in **Start Reward Period**
4. Confirm the token approval transaction in MetaMask
5. Confirm the start period transaction in MetaMask
6. The reward period begins immediately


## APY CALCULATION

The dashboard calculates APY dynamically using the following formula:

```
APY = (rewardRate × 31,536,000 / totalStaked) × 100
```

APY updates in real time as wallets stake and unstake. When more wallets stake the APY decreases because the same reward pool is shared among more stakers. When wallets unstake the APY increases. This mirrors how real DeFi staking protocols display yield.


## DESIGN DECISION — FREE UNSTAKING

Unstaking is never blocked regardless of pause state or reward period status. This is a deliberate design decision that protects stakers — they always maintain access to their principal no matter what is happening with the reward period or contract state. Only new stakes are affected by the pause function.


## PROVIDER ARCHITECTURE

The dashboard uses a dual-provider setup for optimal performance and reliability:

| Provider | Purpose |
|----------|---------|
| MetaMask (Web3Provider) | Signs and broadcasts all write transactions |
| Alchemy (JsonRpcProvider) | Handles all read operations |

This separation ensures reads are fast and reliable while writes are always signed by the user's wallet.


## SEPOLIA TESTNET DEPLOYMENT

| Contract | Address | Etherscan |
|----------|---------|-----------|
| SampleToken | `0x036150039c33b1645080a9c913f96D4c65ccca48` | [View on Etherscan](https://sepolia.etherscan.io/address/0x036150039c33b1645080a9c913f96D4c65ccca48#code) |
| TokenStaking | `0x0823D964ECC9ed0975761F0D08Ac34F21B936D04` | [View on Etherscan](https://sepolia.etherscan.io/address/0x0823D964ECC9ed0975761F0D08Ac34F21B936D04#code) |

Deployed: 2026-04-06


## EXAMPLE TOKEN CONFIGURATION

Example parameters used with this dashboard:

- Token Name: Sample Token
- Token Symbol: STK
- Reward Period: 30 days
- Total Period Rewards: 10,000 STK
- Same token used for staking and rewards


## SECURITY PRACTICES

The dashboard enforces security at two levels:

**UI Level**
- Admin panel is hidden from non-admin wallets
- Network check prevents connection on wrong chain
- Input validation prevents invalid transactions
- Stake button disabled before reward period starts and when paused

**Contract Level**
- All role checks are enforced by the smart contract
- The UI is a convenience layer — the contract is the source of truth
- No transaction can bypass the contract's access control
- ReentrancyGuard on all staking, unstaking, and claiming functions
- SafeERC20 for safe token transfers


## EXAMPLE USE CASES

This dashboard architecture can support many types of projects:

- Protocol token staking with fixed reward periods
- Liquidity mining programs
- Community incentive distributions
- DAO participation rewards
- Game economy staking mechanics
- DeFi yield programs


## FUTURE ENHANCEMENTS

This dashboard serves as the fourth frontend layer in a larger Web3 infrastructure package.

Possible upgrades include:

- Multiple reward token support
- Historical rewards chart
- Mainnet deployment
- Governance dashboard integration


## AUTHOR

Kyle Tredway

Smart Contract Developer / Token Launch Specialist


## LICENSE

MIT License