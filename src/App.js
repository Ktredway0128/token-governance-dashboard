import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';
import TokenStakingABI from './contracts/TokenStaking.json';
import sepoliaDeployment from './contracts/sepolia.json';

const STAKING_ADDRESS = sepoliaDeployment.TokenStaking.address;
const ABI = TokenStakingABI.abi;

const STATUS_COLORS = {
  stake:    { backgroundColor: '#0ea5e9', color: '#fff' },
  unstake:  { backgroundColor: '#f97316', color: '#fff' },
  claim:    { backgroundColor: '#0ea5e9', color: '#fff' },
  admin:    { backgroundColor: '#0ea5e9', color: '#fff' },
  success:  { backgroundColor: '#22c55e', color: '#fff' },
  error:    { backgroundColor: '#dc2626', color: '#fff' },
  default:  { backgroundColor: '#e0f2fe', color: '#0f4c5c' },
};

const parseError = (err) => {
  if (err.message.includes('user rejected'))           return 'Transaction rejected in MetaMask.';
  if (err.message.includes('insufficient funds'))      return 'Insufficient funds for this transaction.';
  if (err.message.includes('Amount must be greater'))  return 'Amount must be greater than 0.';
  if (err.message.includes('Insufficient staked'))     return 'Insufficient staked balance.';
  if (err.message.includes('Previous period'))         return 'Previous reward period has not finished yet.';
  if (err.message.includes('Reward period not set'))   return 'Reward period duration has not been set.';
  if (err.message.includes('Current period'))          return 'Cannot change period while current period is active.';
  if (err.message.includes('Cannot recover'))          return 'Cannot recover staking or reward tokens.';
  return 'Transaction failed. Please try again.';
};

function Spinner() {
  return (
    <span style={{
      display: 'inline-block',
      width: '16px',
      height: '16px',
      border: '2px solid rgba(255,255,255,0.4)',
      borderTop: '2px solid #fff',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      marginRight: '10px',
      verticalAlign: 'middle',
    }} />
  );
}

function StakingProgressBar({ staked, totalSupply }) {
  const stakedNum = Number(ethers.utils.formatUnits(staked, 18));
  const totalNum  = Number(ethers.utils.formatUnits(totalSupply, 18));
  const pct = totalNum > 0 ? Math.min(100, (stakedNum / totalNum) * 100) : 0;
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <p className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>Your Pool Share</p>
        <p className="text-xs font-semibold" style={{ color: '#0f4c5c' }}>{pct.toFixed(2)}%</p>
      </div>
      <div style={{
        height: '8px',
        borderRadius: '9999px',
        backgroundColor: 'rgba(15,76,92,0.12)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '9999px',
          background: 'linear-gradient(90deg, #f97316, #0ea5e9)',
          transition: 'width 0.6s ease',
        }} />
      </div>
    </div>
  );
}

function App() {
  const [contract,        setContract]        = useState(null);
  const [readContract,    setReadContract]    = useState(null);
  const [account,         setAccount]         = useState(null);
  const [isAdmin,         setIsAdmin]         = useState(false);
  const [isPaused,        setIsPaused]        = useState(false);

  // Staking data
  const [totalSupply,     setTotalSupply]     = useState('0');
  const [myStaked,        setMyStaked]        = useState('0');
  const [myEarned,        setMyEarned]        = useState('0');
  const [rewardRate,      setRewardRate]      = useState('0');
  const [periodFinish,    setPeriodFinish]    = useState('0');
  const [rewardPeriod,    setRewardPeriod]    = useState('0');
  const [currentAPY,      setCurrentAPY]      = useState('0');

  // User inputs
  const [stakeAmount,     setStakeAmount]     = useState('');
  const [unstakeAmount,   setUnstakeAmount]   = useState('');

  // Admin inputs
  const [rewardAmount,    setRewardAmount]    = useState('');
  const [newPeriod,       setNewPeriod]       = useState('');
  const [recoverToken,    setRecoverToken]    = useState('');
  const [recoverAmount,   setRecoverAmount]   = useState('');

  // Status
  const [status,          setStatus]          = useState('');
  const [statusStyle,     setStatusStyle]     = useState(STATUS_COLORS.default);
  const [isLoading,       setIsLoading]       = useState(false);
  const [txHash,          setTxHash]          = useState('');

  // Countdown
  const [countdown,       setCountdown]       = useState('');

  useEffect(() => {
    if (!periodFinish || periodFinish === '0') return;
    const tick = () => {
      const diff = Number(periodFinish) - Math.floor(Date.now() / 1000);
      if (diff <= 0) {
        setCountdown('Reward period has ended');
        return;
      }
      const days    = Math.floor(diff / 86400);
      const hours   = Math.floor((diff % 86400) / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setCountdown(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [periodFinish]);

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setStatus('MetaMask not found. Please install it.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0xaa36a7' && chainId !== '0x7a69') {
        setStatus('Please switch MetaMask to Sepolia or Localhost 8545.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      await window.ethereum.request({ method: 'eth_requestAccounts' });

      const metaMaskProvider = new ethers.providers.Web3Provider(window.ethereum);
      const _signer  = metaMaskProvider.getSigner();
      const _account = await _signer.getAddress();

      const isLocalhost = chainId === '0x7a69';
      const alchemyProvider = isLocalhost
        ? new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545')
        : new ethers.providers.JsonRpcProvider(
            process.env.REACT_APP_ALCHEMY_URL,
            { name: 'sepolia', chainId: 11155111 }
          );

      const _contract     = new ethers.Contract(STAKING_ADDRESS, ABI, _signer);
      const _readContract = new ethers.Contract(STAKING_ADDRESS, ABI, alchemyProvider);

      setContract(_contract);
      setReadContract(_readContract);
      setAccount(_account);

      await loadDashboardData(_readContract, _account);
    } catch (err) {
      setStatus('Error connecting wallet: ' + err.message);
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountChange = async (accounts) => {
      setStatus('');
      setTxHash('');
      if (accounts.length === 0) {
        setAccount(null);
        setContract(null);
        setReadContract(null);
        setMyStaked('0');
        setMyEarned('0');
      } else {
        await connectWallet();
      }
    };
    window.ethereum.on('accountsChanged', handleAccountChange);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDashboardData = async (_contract, _account) => {
    try {
      const ADMIN_ROLE = await _contract.ADMIN_ROLE();
      const adminCheck = await _contract.hasRole(ADMIN_ROLE, _account);
      const paused     = await _contract.paused();
      setIsAdmin(adminCheck);
      setIsPaused(paused);

      const _totalSupply  = await _contract.totalSupply();
      const _myStaked     = await _contract.balanceOf(_account);
      const _myEarned     = await _contract.earned(_account);
      const _rewardRate   = await _contract.rewardRate();
      const _periodFinish = await _contract.periodFinish();
      const _rewardPeriod = await _contract.rewardPeriod();

      setTotalSupply(ethers.utils.formatUnits(_totalSupply, 18));
      setMyStaked(ethers.utils.formatUnits(_myStaked, 18));
      setMyEarned(ethers.utils.formatUnits(_myEarned, 18));
      setRewardRate(ethers.utils.formatUnits(_rewardRate, 18));
      setPeriodFinish(_periodFinish.toString());
      setRewardPeriod(_rewardPeriod.toString());

      // Calculate APY
      if (_totalSupply.gt(0) && _rewardRate.gt(0)) {
        const rewardPerYear = _rewardRate.mul(365 * 24 * 3600);
        const apy = rewardPerYear.mul(100).div(_totalSupply);
        setCurrentAPY(apy.toString());
      } else {
        setCurrentAPY('0');
      }

    } catch (err) {
      setStatus('Error loading data: ' + err.message);
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleRefresh = async () => {
    if (!readContract || !account) return;
    setStatus('Refreshing...');
    setStatusStyle(STATUS_COLORS.default);
    await loadDashboardData(readContract, account);
    setStatus('');
  };

  // ===== USER FUNCTIONS =====

  const handleStake = async () => {
    if (!stakeAmount || Number(stakeAmount) <= 0) {
      setStatus('Please enter a valid amount to stake.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Staking tokens...');
      setStatusStyle(STATUS_COLORS.stake);
      setIsLoading(true);
      const amount = ethers.utils.parseUnits(stakeAmount, 18);

      // Approve first
      const stakingToken = new ethers.Contract(
        await readContract.stakingToken(),
        ['function approve(address spender, uint256 amount) returns (bool)'],
        contract.signer
      );
      const approveTx = await stakingToken.approve(STAKING_ADDRESS, amount);
      await approveTx.wait();

      const tx = await contract.stake(amount);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Tokens staked successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
      setStakeAmount('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleUnstake = async () => {
    if (!unstakeAmount || Number(unstakeAmount) <= 0) {
      setStatus('Please enter a valid amount to unstake.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Unstaking tokens...');
      setStatusStyle(STATUS_COLORS.unstake);
      setIsLoading(true);
      const tx = await contract.unstake(ethers.utils.parseUnits(unstakeAmount, 18));
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Tokens unstaked successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
      setUnstakeAmount('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleClaimReward = async () => {
    try {
      setStatus('Claiming rewards...');
      setStatusStyle(STATUS_COLORS.claim);
      setIsLoading(true);
      const tx = await contract.claimReward();
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Rewards claimed successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleUnstakeAndClaim = async () => {
    try {
      setStatus('Unstaking and claiming rewards...');
      setStatusStyle(STATUS_COLORS.unstake);
      setIsLoading(true);
      const tx = await contract.unstakeAndClaim();
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Unstaked and claimed successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ===== ADMIN FUNCTIONS =====

  const handleStartRewardPeriod = async () => {
    if (!rewardAmount || Number(rewardAmount) <= 0) {
      setStatus('Please enter a valid reward amount.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Starting reward period...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const amount = ethers.utils.parseUnits(rewardAmount, 18);

      // Approve reward tokens first
      const rewardToken = new ethers.Contract(
        await readContract.rewardToken(),
        ['function approve(address spender, uint256 amount) returns (bool)'],
        contract.signer
      );
      const approveTx = await rewardToken.approve(STAKING_ADDRESS, amount);
      await approveTx.wait();

      const tx = await contract.startRewardPeriod(amount);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Reward period started!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
      setRewardAmount('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleSetRewardPeriod = async () => {
    if (!newPeriod || Number(newPeriod) <= 0) {
      setStatus('Please enter a valid period in days.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Setting reward period...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const periodSeconds = Number(newPeriod) * 86400;
      const tx = await contract.setRewardPeriod(periodSeconds);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Reward period set!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
      setNewPeriod('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handlePause = async () => {
    try {
      setStatus(isPaused ? 'Unpausing...' : 'Pausing...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const tx = isPaused ? await contract.unpause() : await contract.pause();
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus(isPaused ? 'Staking unpaused!' : 'Staking paused!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readContract, account);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleRecoverTokens = async () => {
    if (!recoverToken || !recoverAmount || Number(recoverAmount) <= 0) {
      setStatus('Please enter a valid token address and amount.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Recovering tokens...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const tx = await contract.recoverTokens(
        recoverToken,
        ethers.utils.parseUnits(recoverAmount, 18)
      );
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Tokens recovered successfully!');
      setStatusStyle(STATUS_COLORS.success);
      setRecoverToken('');
      setRecoverAmount('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const formatTokens = (amount) =>
    Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  const formatDeadline = (timestamp) => {
    if (!timestamp || timestamp === '0') return 'Not set';
    return new Date(Number(timestamp) * 1000).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  const periodActive = () => {
    if (!periodFinish || periodFinish === '0') return false;
    return Date.now() / 1000 < Number(periodFinish);
  };

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="shimmer-bg"></div>
      <div className="content min-h-screen p-8">
        <div className="max-w-5xl mx-auto" style={{ position: 'relative' }}>

          {/* TD LOGO */}
          <img
            src="/td-logo-justtd.png"
            alt="Tredway Development"
            style={{
              position: 'absolute',
              top: '0',
              left: '-110px',
              height: '35px',
            }}
          />

          {/* HEADER */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-5xl font-bold tracking-tight" style={{ color: '#0f4c5c' }}>
                Token <span style={{ color: '#0ea5e9' }}>Staking</span> Dashboard
              </h1>
              <p className="text-sm mt-2 uppercase tracking-widest font-medium" style={{ color: '#64748b' }}>
                Staking Rewards Management Interface
              </p>
            </div>
            {account && (
              <div className="text-right">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="text-xs font-mono px-3 py-1 rounded-lg mb-2 transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    color: '#0f4c5c',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    display: 'block',
                    marginLeft: 'auto',
                  }}>
                  ↻ Refresh
                </button>
                <p className="text-xs font-mono" style={{ color: '#64748b' }}>Connected</p>
                <p className="text-sm font-mono font-semibold" style={{ color: '#0f4c5c' }}>
                  {account.slice(0, 6)}...{account.slice(-4)}
                </p>
              </div>
            )}
          </div>
          <hr style={{ borderColor: 'rgba(255,255,255,0.5)', marginBottom: '2rem' }} />

          {/* STATUS BAR */}
          {status && (
            <div className="mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
              style={statusStyle}>
              {isLoading && <Spinner />}
              <span>{status}</span>
              {txHash && !isLoading && (
                <a href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: '#fff', textDecoration: 'underline', marginLeft: '8px', fontWeight: 'bold' }}>
                  View on Etherscan ↗
                </a>
              )}
            </div>
          )}

          {!account ? (
            <div className="text-center py-32">
              <div className="mb-6 text-6xl">💎</div>
              <button onClick={connectWallet}
                className="px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all hover:opacity-90 mb-6 btn-hover"
                style={{ backgroundColor: '#0ea5e9' }}>
                Connect Wallet
              </button>
              <p className="text-3xl font-bold mb-3 tracking-tight" style={{ color: '#0f4c5c' }}>
                Connect your wallet to start staking
              </p>
              <p className="text-sm uppercase tracking-widest" style={{ color: '#64748b' }}>
                Make sure you're on the Sepolia test network
              </p>
            </div>
          ) : (
            <>
              {/* STATS CARDS */}
              <div className="grid grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Total Staked',    value: formatTokens(totalSupply) + ' STK' },
                  { label: 'Your Stake',      value: formatTokens(myStaked) + ' STK' },
                  { label: 'Your Rewards',    value: formatTokens(myEarned) + ' STK' },
                  { label: 'Current APY',     value: currentAPY + '%' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl p-4 shadow-sm card-hover"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.6)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.8)',
                      borderLeft: '4px solid #0f4c5c',
                    }}>
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>{stat.label}</p>
                    <p className="text-lg font-bold" style={{ color: '#0ea5e9' }}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* REWARD PERIOD CARD */}
              <div className="rounded-2xl p-4 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #0ea5e9',
                }}>
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Reward Period</p>
                    <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>
                      {periodActive() ? (
                        <span style={{ color: '#22c55e' }}>● Active — {countdown}</span>
                      ) : (
                        <span style={{ color: '#dc2626' }}>● Ended</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>End Date</p>
                    <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>{formatDeadline(periodFinish)}</p>
                  </div>
                </div>
              </div>

              {/* MY STAKING POSITION */}
              {Number(myStaked) > 0 && (
                <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    borderLeft: '4px solid #0ea5e9',
                  }}>
                  <h2 className="text-lg font-bold mb-4" style={{ color: '#0f4c5c' }}>My Staking Position</h2>
                  <StakingProgressBar
                    staked={ethers.utils.parseUnits(myStaked, 18)}
                    totalSupply={ethers.utils.parseUnits(totalSupply || '0', 18)}
                  />
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>Staked</p>
                      <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>{formatTokens(myStaked)} STK</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>Earned Rewards</p>
                      <p className="text-sm font-bold" style={{ color: '#0ea5e9' }}>{formatTokens(myEarned)} STK</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide" style={{ color: '#64748b' }}>Pool Share</p>
                      <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>
                        {Number(totalSupply) > 0
                          ? ((Number(myStaked) / Number(totalSupply)) * 100).toFixed(2)
                          : '0'}%
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleClaimReward}
                      disabled={isLoading || Number(myEarned) === 0}
                      className="px-5 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                      style={{
                        backgroundColor: '#0ea5e9',
                        opacity: (isLoading || Number(myEarned) === 0) ? 0.5 : 1,
                        cursor: (isLoading || Number(myEarned) === 0) ? 'not-allowed' : 'pointer',
                      }}>
                      Claim Rewards
                    </button>
                    <button
                      onClick={handleUnstakeAndClaim}
                      disabled={isLoading}
                      className="px-5 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                      style={{
                        backgroundColor: '#f97316',
                        opacity: isLoading ? 0.5 : 1,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                      }}>
                      Unstake & Claim All
                    </button>
                  </div>
                </div>
              )}

              {/* STAKE */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #0ea5e9',
                }}>
                <h2 className="text-lg font-bold mb-4" style={{ color: '#0f4c5c' }}>Stake Tokens</h2>
                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Amount to stake"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ borderColor: '#bae6fd', color: '#334155' }}
                  />
                  <button
                    onClick={handleStake}
                    disabled={isLoading || isPaused}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                    style={{
                      backgroundColor: '#0ea5e9',
                      opacity: (isLoading || isPaused) ? 0.6 : 1,
                      cursor: (isLoading || isPaused) ? 'not-allowed' : 'pointer',
                    }}>
                    Stake
                  </button>
                </div>
                {isPaused && (
                  <p className="text-xs mt-2" style={{ color: '#f97316' }}>
                    ⚠️ Staking is currently paused.
                  </p>
                )}
              </div>

              {/* UNSTAKE */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #f97316',
                }}>
                <h2 className="text-lg font-bold mb-4" style={{ color: '#0f4c5c' }}>Unstake Tokens</h2>
                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Amount to unstake"
                    value={unstakeAmount}
                    onChange={(e) => setUnstakeAmount(e.target.value)}
                    className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ borderColor: '#bae6fd', color: '#334155' }}
                  />
                  <button
                    onClick={() => setUnstakeAmount(myStaked)}
                    disabled={isLoading}
                    className="px-4 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                    style={{
                      backgroundColor: '#0ea5e9',
                      opacity: isLoading ? 0.6 : 1,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                    }}>
                    Max
                  </button>
                  <button
                    onClick={handleUnstake}
                    disabled={isLoading || isPaused}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                    style={{
                      backgroundColor: '#f97316',
                      opacity: (isLoading || isPaused) ? 0.6 : 1,
                      cursor: (isLoading || isPaused) ? 'not-allowed' : 'pointer',
                    }}>
                    Unstake
                  </button>
                </div>
              </div>

              {/* ADMIN PANEL */}
              {isAdmin && (
                <div className="rounded-2xl p-6 shadow-sm card-hover"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.6)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    borderLeft: '4px solid #1a5c38',
                  }}>
                  <h2 className="text-xl font-bold mb-6" style={{ color: '#0f4c5c' }}>Admin Panel</h2>

                  {/* SET REWARD PERIOD */}
                  <p className="text-sm font-semibold mb-2" style={{ color: '#0ea5e9' }}>Set Reward Period Duration</p>
                  <p className="text-xs mb-3" style={{ color: '#64748b' }}>
                    Only callable when no active period. Current period: <strong>{Number(rewardPeriod) > 0 ? Number(rewardPeriod) / 86400 + ' days' : 'Not set'}</strong>
                  </p>
                  <div className="flex gap-3 mb-8">
                    <input
                      type="number"
                      placeholder="Duration in days (e.g. 30)"
                      value={newPeriod}
                      onChange={(e) => setNewPeriod(e.target.value)}
                      className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none"
                      style={{ borderColor: '#bae6fd', color: '#334155' }}
                    />
                    <button
                      onClick={handleSetRewardPeriod}
                      disabled={isLoading || periodActive()}
                      className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                      style={{
                        backgroundColor: '#0ea5e9',
                        opacity: (isLoading || periodActive()) ? 0.6 : 1,
                        cursor: (isLoading || periodActive()) ? 'not-allowed' : 'pointer',
                      }}>
                      Set Period
                    </button>
                  </div>

                  {/* START REWARD PERIOD */}
                  <hr style={{ borderColor: 'rgba(15,76,92,0.1)', margin: '0 0 24px 0' }} />
                  <p className="text-sm font-semibold mb-2" style={{ color: '#0ea5e9' }}>Start Reward Period</p>
                  <p className="text-xs mb-3" style={{ color: '#64748b' }}>
                    Fund the reward pool and start distributing. Requires reward period to be set first.
                  </p>
                  <div className="flex gap-3 mb-8">
                    <input
                      type="number"
                      placeholder="Total reward tokens to distribute"
                      value={rewardAmount}
                      onChange={(e) => setRewardAmount(e.target.value)}
                      className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none"
                      style={{ borderColor: '#bae6fd', color: '#334155' }}
                    />
                    <button
                      onClick={handleStartRewardPeriod}
                      disabled={isLoading || periodActive()}
                      className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                      style={{
                        backgroundColor: '#0ea5e9',
                        opacity: (isLoading || periodActive()) ? 0.6 : 1,
                        cursor: (isLoading || periodActive()) ? 'not-allowed' : 'pointer',
                      }}>
                      Start Period
                    </button>
                  </div>

                  {/* PAUSE / UNPAUSE */}
                  <hr style={{ borderColor: 'rgba(15,76,92,0.1)', margin: '0 0 24px 0' }} />
                  <p className="text-sm font-semibold mb-3" style={{ color: '#0f4c5c' }}>
                    Staking Status: <span style={{ color: isPaused ? '#dc2626' : '#22c55e' }}>
                      {isPaused ? 'Paused' : 'Active'}
                    </span>
                  </p>
                  <button
                    onClick={handlePause}
                    disabled={isLoading}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover mb-8"
                    style={{
                      backgroundColor: isPaused ? '#22c55e' : '#f97316',
                      opacity: isLoading ? 0.6 : 1,
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                    }}>
                    {isPaused ? 'Unpause Staking' : 'Pause Staking'}
                  </button>

                  {/* RECOVER TOKENS */}
                  <hr style={{ borderColor: 'rgba(15,76,92,0.1)', margin: '0 0 24px 0' }} />
                  <p className="text-sm font-semibold mb-2" style={{ color: '#dc2626' }}>Recover Accidentally Sent Tokens</p>
                  <p className="text-xs mb-3" style={{ color: '#64748b' }}>
                    Cannot recover staking or reward tokens. Emergency use only.
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Token contract address (0x...)"
                      value={recoverToken}
                      onChange={(e) => setRecoverToken(e.target.value)}
                      className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none"
                      style={{ borderColor: '#bae6fd', color: '#334155' }}
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={recoverAmount}
                      onChange={(e) => setRecoverAmount(e.target.value)}
                      className="w-36 border rounded-xl px-4 py-3 text-sm outline-none"
                      style={{ borderColor: '#bae6fd', color: '#334155' }}
                    />
                    <button
                      onClick={handleRecoverTokens}
                      disabled={isLoading}
                      className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                      style={{
                        backgroundColor: '#dc2626',
                        opacity: isLoading ? 0.6 : 1,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                      }}>
                      Recover
                    </button>
                  </div>
                </div>
              )}

              {/* EMPTY STATE */}
              {!isAdmin && Number(myStaked) === 0 && (
                <div className="p-4 rounded-xl text-base font-medium text-center"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.4)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,255,255,0.8)',
                    borderLeft: '4px solid #0ea5e9',
                    color: '#64748b',
                  }}>
                  <span style={{ fontSize: '1.6rem' }}>💎</span> Stake your tokens above to start earning rewards.
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;