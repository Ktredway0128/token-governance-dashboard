import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';
import TokenGovernanceABI from './contracts/TokenGovernance.json';
import SampleTokenABI from './contracts/SampleToken.json';
import sepoliaDeployment from './contracts/sepolia.json';
import localhostDeployment from './contracts/localhost.json';

const DEPLOYMENTS = {
  '0xaa36a7': sepoliaDeployment,
  '0x7a69':   localhostDeployment,
};

const GOVERNANCE_ABI = TokenGovernanceABI.abi;
const TOKEN_ABI = SampleTokenABI.abi;

const STATUS_COLORS = {
  propose: { backgroundColor: '#5c2d0e', color: '#fff' },
  vote:    { backgroundColor: '#5c2d0e', color: '#fff' },
  queue:   { backgroundColor: '#1a4a8a', color: '#fff' },
  execute: { backgroundColor: '#0f2d5e', color: '#fff' },
  admin:   { backgroundColor: '#5c2d0e', color: '#fff' },
  success: { backgroundColor: '#22c55e', color: '#fff' },
  error:   { backgroundColor: '#dc2626', color: '#fff' },
  default: { backgroundColor: 'rgba(255,255,255,0.5)', color: '#0f2d5e' },
};

const STATES = ['Pending', 'Active', 'Canceled', 'Defeated', 'Succeeded', 'Queued', 'Expired', 'Executed'];

const STATE_COLORS = {
  Pending:   '#f97316',
  Active:    '#22c55e',
  Canceled:  '#94a3b8',
  Defeated:  '#dc2626',
  Succeeded: '#1a4a8a',
  Queued:    '#8b5cf6',
  Expired:   '#94a3b8',
  Executed:  '#0f4c5c',
};

const ACTION_TYPES = [
  { value: 'transfer',      label: 'Transfer Tokens' },
  { value: 'mint',          label: 'Mint Tokens' },
  { value: 'updateSetting', label: 'Update a Setting' },
  { value: 'custom',        label: 'Custom Action (Advanced)' },
];

const parseError = (err) => {
  if (err.message.includes('user rejected'))             return 'Transaction rejected in MetaMask.';
  if (err.message.includes('insufficient funds'))        return 'Insufficient funds for this transaction.';
  if (err.message.includes('proposer votes below'))      return 'Insufficient tokens to create a proposal.';
  if (err.message.includes('vote not currently active')) return 'Voting is not currently active on this proposal.';
  if (err.message.includes('vote already cast'))         return 'You have already voted on this proposal.';
  if (err.message.includes('proposal not successful'))   return 'Proposal has not succeeded yet.';
  if (err.message.includes('operation is not ready'))    return 'Timelock delay has not passed yet.';
  if (err.message.includes('invalid proposal length'))   return 'Invalid proposal configuration.';
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

function VoteBar({ forVotes, againstVotes, abstainVotes }) {
  const total = Number(forVotes) + Number(againstVotes) + Number(abstainVotes);
  if (total === 0) return null;
  const forPct     = ((Number(forVotes) / total) * 100).toFixed(1);
  const againstPct = ((Number(againstVotes) / total) * 100).toFixed(1);
  const abstainPct = ((Number(abstainVotes) / total) * 100).toFixed(1);
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ height: '8px', borderRadius: '9999px', overflow: 'hidden', display: 'flex', backgroundColor: 'rgba(15,76,92,0.1)' }}>
        <div style={{ width: `${forPct}%`, backgroundColor: '#16a34a', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${againstPct}%`, backgroundColor: '#dc2626', transition: 'width 0.6s ease' }} />
        <div style={{ width: `${abstainPct}%`, backgroundColor: '#94a3b8', transition: 'width 0.6s ease' }} />
      </div>
      <div className="flex justify-between mt-1">
        <p className="text-xs" style={{ color: '#16a34a' }}>For {forPct}%</p>
        <p className="text-xs" style={{ color: '#dc2626' }}>Against {againstPct}%</p>
        <p className="text-xs" style={{ color: '#94a3b8' }}>Abstain {abstainPct}%</p>
      </div>
    </div>
  );
}

function encodeAction(action, tokenAddress) {
  try {
    if (action.type === 'transfer') {
      const iface = new ethers.utils.Interface(['function transfer(address,uint256)']);
      const amount = ethers.utils.parseUnits(action.transferAmount || '0', 18);
      return {
        target: tokenAddress,
        value: ethers.BigNumber.from(0),
        calldata: iface.encodeFunctionData('transfer', [action.transferTo, amount]),
      };
    }
    if (action.type === 'mint') {
      const iface = new ethers.utils.Interface(['function mint(address,uint256)']);
      const amount = ethers.utils.parseUnits(action.mintAmount || '0', 18);
      return {
        target: tokenAddress,
        value: ethers.BigNumber.from(0),
        calldata: iface.encodeFunctionData('mint', [action.mintTo, amount]),
      };
    }
    if (action.type === 'updateSetting') {
      const iface = new ethers.utils.Interface(['function ' + action.settingFunction + '(uint256)']);
      const value = ethers.utils.parseUnits(action.settingValue || '0', 0);
      return {
        target: action.settingTarget,
        value: ethers.BigNumber.from(0),
        calldata: iface.encodeFunctionData(action.settingFunction, [value]),
      };
    }
    if (action.type === 'custom') {
      const iface = new ethers.utils.Interface([`function ${action.signature}`]);
      const funcName = action.signature.split('(')[0];
      const paramTypes = action.signature
        .replace(funcName, '').replace('(', '').replace(')', '')
        .split(',').filter(p => p.trim() !== '');
      const encodedCalldata = paramTypes.length === 0
        ? iface.encodeFunctionData(funcName, [])
        : iface.encodeFunctionData(funcName, JSON.parse(action.calldata || '[]'));
      return {
        target: action.target,
        value: ethers.utils.parseEther(action.ethValue || '0'),
        calldata: encodedCalldata,
      };
    }
  } catch (err) {
    throw new Error(`Failed to encode action: ${err.message}`);
  }
}

function ActionForm({ action, index, onUpdate, onRemove, showRemove }) {
  return (
    <div className="rounded-xl p-4 mb-4"
      style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(15,76,92,0.15)' }}>
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#0f4c5c' }}>
          Action {index + 1}
        </p>
        {showRemove && (
          <button onClick={onRemove} className="text-xs px-2 py-1 rounded-lg"
            style={{ backgroundColor: '#fee2e2', color: '#dc2626' }}>
            Remove
          </button>
        )}
      </div>

      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Action Type</p>
      <select value={action.type} onChange={(e) => onUpdate('type', e.target.value)}
        className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-4"
        style={{ borderColor: '#bae6fd', color: '#334155', backgroundColor: '#fff' }}>
        {ACTION_TYPES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>

      {action.type === 'transfer' && (
        <>
          <p className="text-xs mb-1" style={{ color: '#64748b' }}>
            This will transfer tokens from the governance treasury to a recipient address.
          </p>
          <p className="text-xs uppercase tracking-wide mb-1 mt-3" style={{ color: '#64748b' }}>Recipient Address</p>
          <input type="text" placeholder="0x... recipient wallet address"
            value={action.transferTo || ''} onChange={(e) => onUpdate('transferTo', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Amount (STK)</p>
          <input type="number" placeholder="e.g. 100"
            value={action.transferAmount || ''} onChange={(e) => onUpdate('transferAmount', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
        </>
      )}

      {action.type === 'mint' && (
        <>
          <p className="text-xs mb-1" style={{ color: '#64748b' }}>
            This will mint new tokens to a recipient address. Requires the timelock to hold MINTER_ROLE.
          </p>
          <p className="text-xs uppercase tracking-wide mb-1 mt-3" style={{ color: '#64748b' }}>Recipient Address</p>
          <input type="text" placeholder="0x... recipient wallet address"
            value={action.mintTo || ''} onChange={(e) => onUpdate('mintTo', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Amount to Mint (STK)</p>
          <input type="number" placeholder="e.g. 1000"
            value={action.mintAmount || ''} onChange={(e) => onUpdate('mintAmount', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
        </>
      )}

      {action.type === 'updateSetting' && (
        <>
          <p className="text-xs mb-1" style={{ color: '#64748b' }}>
            This will call any single-value setter function on any contract the timelock has permission to access.
          </p>
          <p className="text-xs uppercase tracking-wide mb-1 mt-3" style={{ color: '#64748b' }}>Target Contract Address</p>
          <input type="text" placeholder="0x... contract address to update"
            value={action.settingTarget || ''} onChange={(e) => onUpdate('settingTarget', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Function Name</p>
          <input type="text" placeholder="e.g. setRewardPeriod or setFee or updateCap"
            value={action.settingFunction || ''} onChange={(e) => onUpdate('settingFunction', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>New Value</p>
          <input type="number" placeholder="e.g. 30 for 30 days, or 500 for 0.5%"
            value={action.settingValue || ''} onChange={(e) => onUpdate('settingValue', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
            Note: the timelock must hold the appropriate role on the target contract for this to execute successfully.
          </p>
        </>
      )}

      {action.type === 'custom' && (
        <>
          <p className="text-xs mb-3" style={{ color: '#64748b' }}>
            Advanced — manually specify any contract function to call.
          </p>
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Target Contract Address</p>
          <input type="text" placeholder="0x... contract to call"
            value={action.target || ''} onChange={(e) => onUpdate('target', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>ETH Value (usually 0)</p>
          <input type="text" placeholder="0"
            value={action.ethValue || '0'} onChange={(e) => onUpdate('ethValue', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Function Signature</p>
          <input type="text" placeholder="e.g. transfer(address,uint256)"
            value={action.signature || ''} onChange={(e) => onUpdate('signature', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-3"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Parameters (JSON array)</p>
          <input type="text" placeholder='e.g. ["0xAddress...", "1000000000000000000"]'
            value={action.calldata || ''} onChange={(e) => onUpdate('calldata', e.target.value)}
            className="w-full border rounded-xl px-4 py-3 text-sm outline-none"
            style={{ borderColor: '#bae6fd', color: '#334155' }} />
          <p className="text-xs mt-2" style={{ color: '#94a3b8' }}>
            Tip: token amounts must be in wei. Example: 100 STK = "100000000000000000000"
          </p>
        </>
      )}
    </div>
  );
}

function App() {
  // Wallet / connection
  const [governanceContract, setGovernanceContract] = useState(null);
  const [tokenContract,      setTokenContract]      = useState(null);
  const [readGovernance,     setReadGovernance]     = useState(null);
  const [readToken,          setReadToken]          = useState(null);
  const [account,            setAccount]            = useState(null);
  const [chainId,            setChainId]            = useState(null);

  // Contract addresses (network-aware)
  const [governanceAddress, setGovernanceAddress] = useState('');
  const [timelockAddress,   setTimelockAddress]   = useState('');
  const [tokenAddress,      setTokenAddress]      = useState('');

  // Token data
  const [tokenBalance,   setTokenBalance]   = useState('0');
  const [votingPower,    setVotingPower]    = useState('0');
  const [delegatee,      setDelegatee]      = useState('');
  const [isDelegated,    setIsDelegated]    = useState(false);

  // Governance data
  const [proposals,      setProposals]      = useState([]);
  const [votingDelay,    setVotingDelay]    = useState('0');
  const [votingPeriod,   setVotingPeriod]   = useState('0');
  const [quorumFraction, setQuorumFraction] = useState('0');
  const [threshold,      setThreshold]      = useState('0');

  // Proposal form
  const [propTitle,       setPropTitle]       = useState('');
  const [propDescription, setPropDescription] = useState('');
  const [propActions,     setPropActions]     = useState([{ type: 'transfer', transferTo: '', transferAmount: '' }]);
  const [proposalFilter,  setProposalFilter]  = useState('active');

  // Delegate to address
  const [delegateTarget, setDelegateTarget] = useState('');

  // Vote reasons
  const [voteReasons, setVoteReasons] = useState({});

  // Status
  const [status,             setStatus]             = useState('');
  const [statusStyle,        setStatusStyle]        = useState(STATUS_COLORS.default);
  const [isLoading,          setIsLoading]          = useState(false);
  const [txHash,             setTxHash]             = useState('');
  const [showDelegateInput,  setShowDelegateInput]  = useState(false);

  // ─────────────────────────────────────────
  // loadDashboardData
  // ─────────────────────────────────────────

  const loadDashboardData = async (_readGovernance, _readToken, _account, _tokenAddress) => {
    try {
      const _balance   = await _readToken.balanceOf(_account);
      const _votes     = await _readToken.getVotes(_account);
      const _delegatee = await _readToken.delegates(_account);

      setTokenBalance(ethers.utils.formatUnits(_balance, 18));
      setVotingPower(ethers.utils.formatUnits(_votes, 18));
      setDelegatee(_delegatee);
      setIsDelegated(_delegatee !== ethers.constants.AddressZero);

      const _votingDelay  = await _readGovernance.votingDelay();
      const _votingPeriod = await _readGovernance.votingPeriod();
      const _threshold    = await _readGovernance.proposalThreshold();
      const _quorum       = await _readGovernance['quorumNumerator()']();

      setVotingDelay(_votingDelay.toString());
      setVotingPeriod(_votingPeriod.toString());
      setThreshold(ethers.utils.formatUnits(_threshold, 18));
      setQuorumFraction(_quorum.toString());

      try {
        const filter = _readGovernance.filters.ProposalCreated();
        const events = await _readGovernance.queryFilter(filter);

        const loadedProposals = await Promise.all(events.map(async (event) => {
          const proposalId = event.args.proposalId;
          const state      = await _readGovernance.state(proposalId);
          const hasVoted   = await _readGovernance.hasVoted(proposalId, _account);
          const votes      = await _readGovernance.proposalVotes(proposalId);
          const snapshot   = await _readGovernance.proposalSnapshot(proposalId);
          const deadline   = await _readGovernance.proposalDeadline(proposalId);
          return {
            id: proposalId,
            description: event.args.description,
            stateLabel: STATES[state],
            targets: event.args.targets,
            ethValues: event.args[3],
            calldatas: event.args.calldatas,
            hasVoted,
            forVotes:     ethers.utils.formatUnits(votes.forVotes, 18),
            againstVotes: ethers.utils.formatUnits(votes.againstVotes, 18),
            abstainVotes: ethers.utils.formatUnits(votes.abstainVotes, 18),
            snapshot: snapshot.toString(),
            deadline: deadline.toString(),
          };
        }));

        setProposals(loadedProposals.reverse());
      } catch (err) {
        console.log('No proposals yet');
      }

    } catch (err) {
      setStatus('Error loading data: ' + err.message);
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // connectWallet
  // ─────────────────────────────────────────

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setStatus('MetaMask not found. Please install it.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const _chainId = await window.ethereum.request({ method: 'eth_chainId' });

      if (_chainId !== '0xaa36a7' && _chainId !== '0x7a69') {
        setStatus('Please switch MetaMask to Sepolia or Localhost 8545.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const deployment = DEPLOYMENTS[_chainId];
      if (!deployment) {
        setStatus('No deployment found for this network.');
        setStatusStyle(STATUS_COLORS.error);
        return;
      }

      const _governanceAddress = deployment.TokenGovernance.address;
      const _timelockAddress   = deployment.TimelockController.address;
      const _tokenAddress      = deployment.SampleToken.address;

      await window.ethereum.request({ method: 'eth_requestAccounts' });

      const metaMaskProvider = new ethers.providers.Web3Provider(window.ethereum);
      const _signer          = metaMaskProvider.getSigner();
      const _account         = await _signer.getAddress();

      const isLocalhost = _chainId === '0x7a69';
      const rpcProvider = isLocalhost
        ? new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545')
        : new ethers.providers.JsonRpcProvider(
            process.env.REACT_APP_ALCHEMY_URL,
            { name: 'sepolia', chainId: 11155111 }
          );

      const _governanceContract = new ethers.Contract(_governanceAddress, GOVERNANCE_ABI, _signer);
      const _tokenContract      = new ethers.Contract(_tokenAddress, TOKEN_ABI, _signer);
      const _readGovernance     = new ethers.Contract(_governanceAddress, GOVERNANCE_ABI, rpcProvider);
      const _readToken          = new ethers.Contract(_tokenAddress, TOKEN_ABI, rpcProvider);

      setGovernanceContract(_governanceContract);
      setTokenContract(_tokenContract);
      setReadGovernance(_readGovernance);
      setReadToken(_readToken);
      setAccount(_account);
      setChainId(_chainId);
      setGovernanceAddress(_governanceAddress);
      setTimelockAddress(_timelockAddress);
      setTokenAddress(_tokenAddress);

      await loadDashboardData(_readGovernance, _readToken, _account, _tokenAddress);

    } catch (err) {
      setStatus('Error connecting wallet: ' + err.message);
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // Account change listener
  // ─────────────────────────────────────────

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountChange = async (accounts) => {
      setStatus('');
      setTxHash('');
      setVoteReasons({});
      if (accounts.length === 0) {
        setAccount(null);
        setGovernanceContract(null);
        setTokenContract(null);
        setReadGovernance(null);
        setReadToken(null);
        setChainId(null);
        setGovernanceAddress('');
        setTimelockAddress('');
        setTokenAddress('');
        setTokenBalance('0');
        setVotingPower('0');
        setDelegatee('');
        setIsDelegated(false);
        setProposals([]);
        setShowDelegateInput(false);
      } else {
        await connectWallet();
      }
    };
    window.ethereum.on('accountsChanged', handleAccountChange);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────
  // Refresh
  // ─────────────────────────────────────────

  const handleRefresh = async () => {
    if (!readGovernance || !account) return;
    setStatus('Refreshing...');
    setStatusStyle(STATUS_COLORS.default);
    await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    setStatus('');
  };

  // ─────────────────────────────────────────
  // Delegation
  // ─────────────────────────────────────────

  const handleSelfDelegate = async () => {
    try {
      setStatus('Activating voting power...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const tx = await tokenContract.selfDelegate();
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Voting power activated!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleDelegateTo = async () => {
    if (!delegateTarget || !ethers.utils.isAddress(delegateTarget)) {
      setStatus('Please enter a valid wallet address to delegate to.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Delegating voting power...');
      setStatusStyle(STATUS_COLORS.admin);
      setIsLoading(true);
      const tx = await tokenContract.delegate(delegateTarget);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Voting power delegated successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
      setDelegateTarget('');
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // Propose
  // ─────────────────────────────────────────

  const handlePropose = async () => {
    if (!propTitle) {
      setStatus('Please enter a proposal title.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    if (!propDescription) {
      setStatus('Please enter a proposal description.');
      setStatusStyle(STATUS_COLORS.error);
      return;
    }
    try {
      setStatus('Creating proposal...');
      setStatusStyle(STATUS_COLORS.propose);
      setIsLoading(true);

      const targets   = [];
      const values    = [];
      const calldatas = [];

      for (const action of propActions) {
        const encoded = encodeAction(action, tokenAddress);
        targets.push(encoded.target);
        values.push(encoded.value);
        calldatas.push(encoded.calldata);
      }

      const fullDescription = `${propTitle} — ${propDescription}`;
      const tx = await governanceContract.propose(targets, values, calldatas, fullDescription);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Proposal created successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
      setPropTitle('');
      setPropDescription('');
      setPropActions([{ type: 'transfer', transferTo: '', transferAmount: '' }]);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // Vote
  // ─────────────────────────────────────────

  const handleVote = async (proposalId, support) => {
    try {
      const voteLabels = { 0: 'Against', 1: 'For', 2: 'Abstain' };
      const voteColors = {
        0: { backgroundColor: '#dc2626', color: '#fff' },
        1: { backgroundColor: '#16a34a', color: '#fff' },
        2: { backgroundColor: '#64748b', color: '#fff' },
      };
      setStatus(`Casting ${voteLabels[support]} vote...`);
      setStatusStyle(voteColors[support]);
      setIsLoading(true);
      const reason = voteReasons[proposalId.toString()] || '';
      const tx = reason
        ? await governanceContract.castVoteWithReason(proposalId, support, reason)
        : await governanceContract.castVote(proposalId, support);
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus(`${voteLabels[support]} vote cast successfully!`);
      setVoteReasons(prev => {
        const updated = { ...prev };
        delete updated[proposalId.toString()];
        return updated;
      });
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // Queue / Execute / Cancel
  // ─────────────────────────────────────────

  const handleQueue = async (proposal) => {
    try {
      setStatus('Queueing proposal in timelock...');
      setStatusStyle(STATUS_COLORS.queue);
      setIsLoading(true);
      const descriptionHash = ethers.utils.id(proposal.description);
      const values = proposal.ethValues.map(v => ethers.BigNumber.from(v.toString()));
      const tx = await governanceContract.queue(
        proposal.targets, values, proposal.calldatas, descriptionHash
      );
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Proposal queued in timelock!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleExecute = async (proposal) => {
    try {
      setStatus('Executing proposal...');
      setStatusStyle(STATUS_COLORS.execute);
      setIsLoading(true);
      const descriptionHash = ethers.utils.id(proposal.description);
      const values = proposal.ethValues.map(v => ethers.BigNumber.from(v.toString()));
      const tx = await governanceContract.execute(
        proposal.targets, values, proposal.calldatas, descriptionHash
      );
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Proposal executed successfully!');
      setStatusStyle(STATUS_COLORS.success);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  const handleCancel = async (proposal) => {
    try {
      setStatus('Canceling proposal...');
      setStatusStyle(STATUS_COLORS.error);
      setIsLoading(true);
      const descriptionHash = ethers.utils.id(proposal.description);
      const values = proposal.ethValues.map(v => ethers.BigNumber.from(v.toString()));
      const tx = await governanceContract.cancel(
        proposal.targets, values, proposal.calldatas, descriptionHash
      );
      await tx.wait();
      await new Promise(resolve => setTimeout(resolve, 2000));
      setIsLoading(false);
      setTxHash(tx.hash);
      setStatus('Proposal canceled.');
      setStatusStyle(STATUS_COLORS.default);
      await loadDashboardData(readGovernance, readToken, account, tokenAddress);
    } catch (err) {
      setIsLoading(false);
      setTxHash('');
      setStatus(parseError(err));
      setStatusStyle(STATUS_COLORS.error);
    }
  };

  // ─────────────────────────────────────────
  // Proposal form helpers
  // ─────────────────────────────────────────

  const addAction = () => {
    setPropActions([...propActions, { type: 'transfer', transferTo: '', transferAmount: '' }]);
  };

  const removeAction = (index) => {
    setPropActions(propActions.filter((_, i) => i !== index));
  };

  const updateAction = (index, field, value) => {
    const updated = [...propActions];
    updated[index][field] = value;
    setPropActions(updated);
  };

  const formatTokens = (amount) =>
    Number(amount).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });

  // ─────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────

  return (
    <div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="shimmer-bg"></div>
      <div className="content min-h-screen p-8">
        <div className="max-w-5xl mx-auto" style={{ position: 'relative' }}>

          {/* TD LOGO */}
          <img src="/td-logo-justtd.png" alt="Tredway Development"
            style={{ position: 'absolute', top: '0', left: '-110px', height: '35px' }} />

          {/* HEADER */}
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-5xl font-bold tracking-tight" style={{ color: '#0f4c5c' }}>
                Token <span style={{ color: '#5c2d0e' }}>Governance</span> Dashboard
              </h1>
              <p className="text-sm mt-2 uppercase tracking-widest font-medium" style={{ color: '#64748b' }}>
                On-Chain Governance Management Interface
              </p>
            </div>
            {account && (
              <div className="text-right">
                <button onClick={handleRefresh} disabled={isLoading}
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
          <hr style={{ borderColor: 'rgba(15,76,92,0.2)', marginBottom: '2rem' }} />

          {/* STATUS BAR */}
          {status && (
            <div className="mb-6 p-4 rounded-xl text-sm font-medium flex items-center gap-2 transition-all"
              style={statusStyle}>
              {isLoading && <Spinner />}
              <span>{status}</span>
              {txHash && !isLoading && chainId === '0xaa36a7' && (
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
              <div className="mb-6 text-6xl">⚖️</div>
              <button onClick={connectWallet}
                className="px-8 py-4 rounded-xl font-semibold text-white text-lg transition-all hover:opacity-90 mb-6 btn-hover"
                style={{ backgroundColor: '#5c2d0e' }}>
                Connect Wallet
              </button>
              <p className="text-3xl font-bold mb-3 tracking-tight" style={{ color: '#0f4c5c' }}>
                Connect your wallet to participate in governance
              </p>
              <p className="text-sm uppercase tracking-widest" style={{ color: '#64748b' }}>
                Make sure you're on the Sepolia test network or Localhost 8545
              </p>
            </div>
          ) : (
            <>
              {/* STATS CARDS */}
              <div className="grid grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Token Balance',     value: formatTokens(tokenBalance) + ' STK' },
                  { label: 'Voting Power',       value: formatTokens(votingPower) + ' STK' },
                  { label: 'Proposal Threshold', value: formatTokens(threshold) + ' STK' },
                  { label: 'Quorum Required',    value: quorumFraction + '%' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl p-4 shadow-sm card-hover"
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.55)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      border: '1px solid rgba(255,255,255,0.8)',
                      borderLeft: '4px solid #5c2d0e',
                    }}>
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>{stat.label}</p>
                    <p className="text-lg font-bold" style={{ color: '#0f4c5c' }}>{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* DELEGATION CARD */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #5c2d0e',
                }}>
                <h2 className="text-lg font-bold mb-2" style={{ color: '#0f4c5c' }}>Voting Power</h2>

                {isDelegated ? (
                  <div>
                    <p className="text-sm mb-1" style={{ color: '#64748b' }}>
                      <span style={{ color: '#22c55e' }}>● Active</span> — Your voting power is delegated and ready
                    </p>
                    <p className="text-xs font-mono mb-4" style={{ color: '#64748b' }}>
                      Delegated to: {delegatee.slice(0, 6)}...{delegatee.slice(-4)}
                    </p>
                    <button onClick={() => setShowDelegateInput(prev => !prev)}
                      className="text-xs font-semibold transition-all hover:opacity-80"
                      style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      {showDelegateInput ? '▲ Hide' : '▼ Change delegation address'}
                    </button>
                    {showDelegateInput && (
                      <div className="flex gap-3 mt-3">
                        <input type="text" placeholder="0x... wallet address to delegate to"
                          value={delegateTarget} onChange={(e) => setDelegateTarget(e.target.value)}
                          className="flex-1 border rounded-xl px-4 py-2 text-sm outline-none"
                          style={{ borderColor: '#bae6fd', color: '#334155' }} />
                        <button onClick={handleDelegateTo} disabled={isLoading}
                          className="px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                          style={{ backgroundColor: '#5c2d0e', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                          Delegate
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-sm mb-4" style={{ color: '#64748b' }}>
                      ⚠️ Activate your voting power before creating or voting on proposals. This is a one time setup.
                    </p>
                    <button onClick={handleSelfDelegate} disabled={isLoading}
                      className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover mb-4"
                      style={{ backgroundColor: '#5c2d0e', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                      Activate My Voting Power
                    </button>
                    <div>
                      <button onClick={() => setShowDelegateInput(prev => !prev)}
                        className="text-xs font-semibold transition-all hover:opacity-80"
                        style={{ color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        {showDelegateInput ? '▲ Hide' : '▼ Or delegate to another address instead'}
                      </button>
                      {showDelegateInput && (
                        <div className="flex gap-3 mt-3">
                          <input type="text" placeholder="0x... wallet address to delegate to"
                            value={delegateTarget} onChange={(e) => setDelegateTarget(e.target.value)}
                            className="flex-1 border rounded-xl px-4 py-2 text-sm outline-none"
                            style={{ borderColor: '#bae6fd', color: '#334155' }} />
                          <button onClick={handleDelegateTo} disabled={isLoading}
                            className="px-4 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                            style={{ backgroundColor: '#5c2d0e', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                            Delegate
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* GOVERNANCE SETTINGS */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #5c2d0e',
                }}>
                <h2 className="text-lg font-bold mb-4" style={{ color: '#0f4c5c' }}>Governance Settings</h2>
                <div className="grid grid-cols-4 gap-4">
                  {[
                    { label: 'Voting Delay',   value: (Number(votingDelay) / 7200).toFixed(1) + ' days' },
                    { label: 'Voting Period',  value: (Number(votingPeriod) / 50400).toFixed(1) + ' weeks' },
                    { label: 'Timelock Delay', value: '2 days' },
                    { label: 'Total Proposals', value: proposals.length },
                  ].map((setting) => (
                    <div key={setting.label}>
                      <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>{setting.label}</p>
                      <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>{setting.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* CREATE PROPOSAL */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #5c2d0e',
                }}>
                <h2 className="text-lg font-bold mb-4" style={{ color: '#0f4c5c' }}>Create Proposal</h2>

                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Proposal Title</p>
                <input type="text" placeholder="Short title for this proposal e.g. Treasury Transfer #1"
                  value={propTitle} onChange={(e) => setPropTitle(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-4"
                  style={{ borderColor: '#bae6fd', color: '#334155' }} />

                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Description</p>
                <textarea placeholder="Describe what this proposal does and why token holders should vote for it..."
                  value={propDescription} onChange={(e) => setPropDescription(e.target.value)}
                  rows={3} className="w-full border rounded-xl px-4 py-3 text-sm outline-none mb-6"
                  style={{ borderColor: '#bae6fd', color: '#334155', resize: 'vertical' }} />

                <p className="text-xs uppercase tracking-wide mb-3" style={{ color: '#64748b' }}>
                  Actions — {propActions.length} action{propActions.length > 1 ? 's' : ''} added
                </p>

                {propActions.map((action, index) => (
                  <ActionForm
                    key={index}
                    action={action}
                    index={index}
                    onUpdate={(field, value) => updateAction(index, field, value)}
                    onRemove={() => removeAction(index)}
                    showRemove={propActions.length > 1}
                  />
                ))}

                <button onClick={addAction}
                  className="px-4 py-2 rounded-xl text-sm font-semibold mb-6 transition-all hover:opacity-80"
                  style={{
                    backgroundColor: 'rgba(15,76,92,0.1)',
                    border: '1px solid rgba(15,76,92,0.2)',
                    color: '#0f4c5c',
                  }}>
                  + Add Another Action
                </button>

                <div>
                  <button onClick={handlePropose}
                    disabled={isLoading || !isDelegated || Number(votingPower) < Number(threshold)}
                    className="px-6 py-3 rounded-xl font-semibold text-white transition-all hover:opacity-90 btn-hover"
                    style={{
                      backgroundColor: '#5c2d0e',
                      opacity: (isLoading || !isDelegated || Number(votingPower) < Number(threshold)) ? 0.6 : 1,
                      cursor: (isLoading || !isDelegated || Number(votingPower) < Number(threshold)) ? 'not-allowed' : 'pointer',
                    }}>
                    Submit Proposal
                  </button>
                  {!isDelegated && (
                    <p className="text-xs mt-2" style={{ color: '#f97316' }}>
                      ⚠️ You must activate voting power before creating a proposal.
                    </p>
                  )}
                  {isDelegated && Number(votingPower) < Number(threshold) && (
                    <p className="text-xs mt-2" style={{ color: '#f97316' }}>
                      ⚠️ You need at least {threshold} STK voting power to create a proposal. You currently have {formatTokens(votingPower)} STK.
                    </p>
                  )}
                </div>
              </div>

              {/* PROPOSALS LIST */}
              <div className="rounded-2xl p-6 mb-8 shadow-sm card-hover"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.55)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  borderLeft: '4px solid #5c2d0e',
                }}>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold" style={{ color: '#0f4c5c' }}>
                    Proposals {proposals.length > 0 && <span style={{ color: '#64748b', fontSize: '0.9rem' }}>({proposals.length})</span>}
                  </h2>
                  <div className="flex gap-2">
                    {['active', 'all'].map(f => (
                      <button key={f} onClick={() => setProposalFilter(f)}
                        className="text-xs font-semibold px-3 py-1 rounded-lg transition-all"
                        style={{
                          backgroundColor: proposalFilter === f ? '#5c2d0e' : 'rgba(15,76,92,0.1)',
                          color: proposalFilter === f ? '#fff' : '#0f4c5c',
                          border: '1px solid rgba(15,76,92,0.2)',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {proposals.length === 0 ? (
                  <p className="text-sm" style={{ color: '#64748b' }}>No proposals yet. Create the first one above.</p>
                ) : (
                  <div>
                    {proposals
                      .filter(p => proposalFilter === 'all' || ['Pending', 'Active', 'Succeeded', 'Queued'].includes(p.stateLabel))
                      .map((proposal) => {
                        const totalVotes = Number(proposal.forVotes) + Number(proposal.againstVotes) + Number(proposal.abstainVotes);
                        const quorumMet = totalVotes >= Number(quorumFraction) / 100 * Number(tokenBalance);

                        return (
                          <div key={proposal.id.toString()} className="rounded-xl p-5 mb-4"
                            style={{ backgroundColor: 'rgba(255,255,255,0.6)', border: '1px solid rgba(15,76,92,0.15)' }}>

                            <div className="flex justify-between items-start mb-2">
                              <p className="text-sm font-bold" style={{ color: '#0f4c5c' }}>{proposal.description}</p>
                              <span className="text-xs font-bold px-3 py-1 rounded-full ml-4"
                                style={{
                                  backgroundColor: STATE_COLORS[proposal.stateLabel] + '20',
                                  color: STATE_COLORS[proposal.stateLabel],
                                  border: `1px solid ${STATE_COLORS[proposal.stateLabel]}40`,
                                  whiteSpace: 'nowrap',
                                }}>
                                {proposal.stateLabel}
                              </span>
                            </div>

                            <p className="text-xs font-mono mb-1" style={{ color: '#94a3b8' }}>
                              ID: {proposal.id.toString().slice(0, 10)}...
                            </p>
                            <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
                              Snapshot block: {proposal.snapshot} — Voting ends block: {proposal.deadline}
                            </p>

                            {proposal.targets && proposal.targets.length > 0 && (
                              <div className="mb-3 p-3 rounded-lg"
                                style={{ backgroundColor: 'rgba(15,76,92,0.05)', border: '1px solid rgba(15,76,92,0.1)' }}>
                                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>
                                  Actions ({proposal.targets.length})
                                </p>
                                {proposal.targets.map((target, i) => (
                                  <div key={i} className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold px-2 py-0.5 rounded"
                                      style={{ backgroundColor: '#5c2d0e20', color: '#5c2d0e' }}>
                                      {i + 1}
                                    </span>
                                    <p className="text-xs font-mono" style={{ color: '#64748b' }}>
                                      Contract: {target.slice(0, 6)}...{target.slice(-4)}
                                    </p>
                                    {target.toLowerCase() === tokenAddress.toLowerCase() && (
                                      <span className="text-xs px-2 py-0.5 rounded"
                                        style={{ backgroundColor: '#1a4a8a20', color: '#1a4a8a' }}>
                                        Token Contract
                                      </span>
                                    )}
                                    {target.toLowerCase() === timelockAddress.toLowerCase() && (
                                      <span className="text-xs px-2 py-0.5 rounded"
                                        style={{ backgroundColor: '#8b5cf620', color: '#8b5cf6' }}>
                                        Timelock
                                      </span>
                                    )}
                                    {target.toLowerCase() === governanceAddress.toLowerCase() && (
                                      <span className="text-xs px-2 py-0.5 rounded"
                                        style={{ backgroundColor: '#f9731620', color: '#f97316' }}>
                                        Governance
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            <p className="text-xs mb-3 font-semibold"
                              style={{ color: quorumMet ? '#16a34a' : '#f97316' }}>
                              {quorumMet ? '✅ Quorum reached' : `⚠️ Quorum not yet reached — need ${quorumFraction}% participation`}
                            </p>

                            <VoteBar
                              forVotes={proposal.forVotes}
                              againstVotes={proposal.againstVotes}
                              abstainVotes={proposal.abstainVotes}
                            />

                            <div className="grid grid-cols-3 gap-3 mb-4">
                              <div className="rounded-lg p-2 text-center"
                                style={{ backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#16a34a' }}>For</p>
                                <p className="text-sm font-bold" style={{ color: '#16a34a' }}>{formatTokens(proposal.forVotes)}</p>
                              </div>
                              <div className="rounded-lg p-2 text-center"
                                style={{ backgroundColor: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.2)' }}>
                                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#dc2626' }}>Against</p>
                                <p className="text-sm font-bold" style={{ color: '#dc2626' }}>{formatTokens(proposal.againstVotes)}</p>
                              </div>
                              <div className="rounded-lg p-2 text-center"
                                style={{ backgroundColor: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.2)' }}>
                                <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#64748b' }}>Abstain</p>
                                <p className="text-sm font-bold" style={{ color: '#64748b' }}>{formatTokens(proposal.abstainVotes)}</p>
                              </div>
                            </div>

                            {proposal.stateLabel === 'Active' && !proposal.hasVoted && (
                              <div>
                                <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>Cast Your Vote</p>
                                <input type="text" placeholder="Optional: add a reason for your vote..."
                                  value={voteReasons[proposal.id.toString()] || ''}
                                  onChange={(e) => setVoteReasons(prev => ({
                                    ...prev,
                                    [proposal.id.toString()]: e.target.value
                                  }))}
                                  className="w-full border rounded-xl px-4 py-2 text-sm outline-none mb-3"
                                  style={{ borderColor: '#bae6fd', color: '#334155' }} />
                                <div className="flex gap-3">
                                  <button onClick={() => handleVote(proposal.id, 1)} disabled={isLoading}
                                    className="flex-1 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                                    style={{ backgroundColor: '#16a34a', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                    ✓ For
                                  </button>
                                  <button onClick={() => handleVote(proposal.id, 0)} disabled={isLoading}
                                    className="flex-1 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                                    style={{ backgroundColor: '#dc2626', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                    ✗ Against
                                  </button>
                                  <button onClick={() => handleVote(proposal.id, 2)} disabled={isLoading}
                                    className="flex-1 py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                                    style={{ backgroundColor: '#64748b', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                    — Abstain
                                  </button>
                                </div>
                              </div>
                            )}

                            {proposal.stateLabel === 'Active' && proposal.hasVoted && (
                              <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                                ✅ You have already voted on this proposal
                              </p>
                            )}

                            {proposal.stateLabel === 'Pending' && (
                              <button onClick={() => handleCancel(proposal)} disabled={isLoading}
                                className="w-full py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover mt-2"
                                style={{ backgroundColor: '#dc2626', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                Cancel Proposal
                              </button>
                            )}

                            {proposal.stateLabel === 'Succeeded' && (
                              <button onClick={() => handleQueue(proposal)} disabled={isLoading}
                                className="w-full py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover mt-2"
                                style={{ backgroundColor: '#1a4a8a', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                Queue in Timelock
                              </button>
                            )}

                            {proposal.stateLabel === 'Queued' && (
                              <div className="mt-2">
                                <p className="text-xs mb-2" style={{ color: '#64748b' }}>
                                  This proposal has passed. After the 2 day timelock period you may execute to finalize on-chain.
                                </p>
                                <button onClick={() => handleExecute(proposal)} disabled={isLoading}
                                  className="w-full py-2 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90 btn-hover"
                                  style={{ backgroundColor: '#0f2d5e', opacity: isLoading ? 0.6 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}>
                                  Execute Proposal
                                </button>
                              </div>
                            )}

                            {proposal.stateLabel === 'Executed' && (
                              <p className="text-xs font-semibold mt-2" style={{ color: '#0f4c5c' }}>
                                ✅ This proposal has been executed on-chain
                              </p>
                            )}

                            {proposal.stateLabel === 'Defeated' && (
                              <p className="text-xs font-semibold mt-2" style={{ color: '#dc2626' }}>
                                ✗ This proposal was defeated — quorum not reached or against votes won
                              </p>
                            )}

                            {proposal.stateLabel === 'Canceled' && (
                              <p className="text-xs font-semibold mt-2" style={{ color: '#94a3b8' }}>
                                ✗ This proposal was canceled
                              </p>
                            )}

                            {proposal.stateLabel === 'Expired' && (
                              <p className="text-xs font-semibold mt-2" style={{ color: '#94a3b8' }}>
                                ✗ This proposal expired before execution
                              </p>
                            )}

                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;