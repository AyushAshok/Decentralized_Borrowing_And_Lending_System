import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import Lending from './Lending.json';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const CONTRACT_ADDRESS = "0x19BcF7929Db045C80EDadDbb9a73aD7B996e4964";


// Listening for the LiquidationAttempt event

function App() {
    const [accounts, setAccounts] = useState([]);
    const [currentAccount, setCurrentAccount] = useState('');
    const [contract, setContract] = useState(null);
    const [provider, setProvider] = useState(null);
    const [accountBalance, setAccountBalance] = useState('0');
    const [loanAmount, setLoanAmount] = useState('');
    const [collateralAmount, setCollateralAmount] = useState('');
    const [borrowerAddress, setBorrowerAddress] = useState('');
    const [poolBalance, setPoolBalance] = useState('0');
    const [contractBalance, setContractBalance] = useState('0');
    const [loanDetails, setLoanDetails] = useState([]);
    const [fundAmount, setFundAmount] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [lenderList, setLenderList] = useState([]);
    const [selectedLender, setSelectedLender] = useState('');
    const [showLenderModal, setShowLenderModal] = useState(false);
    const [recentEvents, setRecentEvents] = useState([]);
    const [loansList, setLoansList] = useState([]);
    const [showRepayConfirm, setShowRepayConfirm] = useState(null);

    // Connect to MetaMask
    const connectWallet = async () => {
        if (!window.ethereum) {
            toast.error("Please install MetaMask!");
            return;
        }
        try {
            setIsLoading(true);
            const provider = new ethers.BrowserProvider(window.ethereum);
            setProvider(provider);
            const accounts = await provider.send("eth_requestAccounts", []);
            setAccounts(accounts);
            setCurrentAccount(accounts[0]);

            const signer = await provider.getSigner();
            const contractInstance = new ethers.Contract(
                CONTRACT_ADDRESS,
                Lending.abi,
                signer
            );
            setContract(contractInstance);
            await getAccountBalance(accounts[0], provider);
            await getLenderList(accounts, contractInstance);
            await getContractBalance(provider);
            await getAllLoans(accounts, contractInstance);
            await getLoanDetails(contractInstance, accounts[0]);
            setupEventListeners(contractInstance);
            toast.success("Wallet connected!");
        } catch (error) {
            console.error("Error connecting wallet:", error);
            toast.error("Failed to connect wallet");
        } finally {
            setIsLoading(false);
        }
    };

    // Update contract signer when account changes
    const updateContractSigner = async (account) => {
        if (account && provider) {
            try {
                const signer = await provider.getSigner(account);
                const newContract = new ethers.Contract(
                    CONTRACT_ADDRESS,
                    Lending.abi,
                    signer
                );
                setContract(newContract);
                await getAccountBalance(account, provider);
                setupEventListeners(newContract);
            } catch (error) {
                console.error("Error updating signer:", error);
                toast.error("Failed to update account");
            }
        }
    };

    // Setup event listeners for the contract
    const setupEventListeners = (contractInstance) => {
        if (!contractInstance) return;

        contractInstance.removeAllListeners();

        contractInstance.on("Requested", (borrower, lender, amount, event) => {
            console.log("Loan Requested Event:", { borrower, lender, amount: ethers.formatEther(amount) });
            addNewEvent("Loan Requested", borrower, lender, amount);
            refreshData();
        });

        contractInstance.on("Funded", (borrower, lender, amount, event) => {
            console.log("Loan Funded Event:", { borrower, lender, amount: ethers.formatEther(amount) });
            addNewEvent("Loan Funded", borrower, lender, amount);
            refreshData();
        });

        contractInstance.on("Repaid", (borrower, lender, amount, event) => {
            console.log("Loan Repaid Event:", { borrower, lender, amount: ethers.formatEther(amount) });
            addNewEvent("Loan Repaid", borrower, lender, amount);
            refreshData();
        });

        contractInstance.on("LoanCancelled", (borrower, amount, event) => {
            console.log("Loan Cancelled Event:", { borrower, amount: ethers.formatEther(amount) });
            addNewEvent("Loan Cancelled", borrower, ethers.ZeroAddress, amount);
            refreshData();
        });

        contractInstance.on("Defaulted", (borrower, lender, amount, event) => {
            console.log("Collateral Liquidated Event:", { borrower, lender, amount: ethers.formatEther(amount) });
            addNewEvent("Collateral Liquidated", borrower, lender, amount);
            refreshData();
        });
    };

    // Add a new event to the recent events list
    const addNewEvent = (type, borrower, lender, amount) => {
        setRecentEvents(prevEvents => {
            const newEvent = {
                type,
                borrower,
                lender,
                amount: ethers.formatEther(amount),
                timestamp: new Date().toLocaleString()
            };
            return [newEvent, ...prevEvents.slice(0, 9)];
        });
    };

    // Refresh all data
    const refreshData = async () => {
        if (contract && currentAccount && provider) {
            try {
                await Promise.all([
                    getAccountBalance(currentAccount, provider),
                    getPoolBalance(),
                    getContractBalance(provider),
                    getLenderList(accounts, contract),
                    getAllLoans(accounts, contract),
                    getLoanDetails(contract, currentAccount)
                ]);
            } catch (error) {
                console.error("Error refreshing data:", error);
                toast.error("Failed to refresh data");
            }
        }
    };

    // Switch between connected accounts
    const switchAccount = async (account) => {
        setCurrentAccount(account);
        await updateContractSigner(account);
        await refreshData();
    };

    // Get account ETH balance
    const getAccountBalance = async (account, provider) => {
        if (!account || !provider) return;
        try {
            const balance = await provider.getBalance(account);
            setAccountBalance(ethers.formatEther(balance));
        } catch (error) {
            console.error("Error getting account balance:", error);
        }
    };

    // Get list of lenders with contributions
    const getLenderList = async (accounts, contractInstance) => {
        if (!contractInstance || !accounts || accounts.length === 0) return;
        try {
            const lenders = [];
            for (const account of accounts) {
                if (!ethers.isAddress(account)) continue;
                const contribution = await contractInstance.lenderContributions(account);
                if (contribution > 0) {
                    { console.log("The lenders are: ", account) }
                    lenders.push({
                        address: account,
                        contribution: ethers.formatEther(contribution)
                    });
                }
            }
            setLenderList(lenders);
        } catch (error) {
            console.error("Error fetching lender list:", error);
            toast.error("Failed to fetch lender list");
        }
    };

    // Get all loans for connected accounts
    const getAllLoans = async (accounts, contractInstance) => {
        if (!contractInstance || !accounts || accounts.length === 0) return;
        try {
            const loansList = [];
            console.log("Accounts to check:", accounts);

            for (const account of accounts) {
                if (!ethers.isAddress(account)) {
                    console.log("Invalid address skipped:", account);
                    continue;
                }

                console.log("Fetching loan for account:", account);
                const loan = await contractInstance.loans(account);
                console.log("Loan fetched:", loan);

                if (loan.borrower !== ethers.ZeroAddress) {
                    console.log("Valid loan found for account:", account);

                    loansList.push({
                        borrower: loan.borrower,
                        lender: loan.lender,
                        requested_amt: ethers.formatEther(loan.requested_amt),
                        repay_amt: ethers.formatEther(loan.repay_amt),
                        interest_rate: loan.interest_rate.toString(),
                        state: loan.state.toString(),
                        date: loan.date.toString(),
                        collateral_amt: ethers.formatEther(loan.collateral_amt)
                    });
                } else {
                    console.log("Loan has empty borrower, skipping account:", account);
                }
            }

            console.log("Final loansList:", loansList);
            setLoansList(loansList);
        } catch (error) {
            console.error("Error fetching all loans:", error);
            toast.error("Failed to fetch loans");
        }
    };

    // Get the actual contract ETH balance
    const getContractBalance = async (provider) => {
        if (!provider) return;
        try {
            const balance = await provider.getBalance(CONTRACT_ADDRESS);
            setContractBalance(ethers.formatEther(balance));
        } catch (error) {
            console.error("Error getting contract balance:", error);
        }
    };

    // Add funds to the lending pool
    const addFund = async () => {
        if (!fundAmount || isNaN(fundAmount) || fundAmount <= 0) {
            toast.error("Enter a valid amount");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.addFund({
                value: ethers.parseEther(fundAmount),
                gasLimit: 300000
            });
            toast.info("Transaction submitted. Waiting for confirmation...");
            await tx.wait();
            setFundAmount('');
            await refreshData();
            toast.success("Funds added successfully!");
        } catch (error) {
            console.error("Error adding funds:", error);
            toast.error(error.reason || "Failed to add funds");
        } finally {
            setIsLoading(false);
        }
    };

    // Open lender selection modal for loan request
    const openLenderModal = () => {
        if (!loanAmount || !collateralAmount || isNaN(loanAmount) || isNaN(collateralAmount) || loanAmount <= 0 || collateralAmount <= 0) {
            toast.error("Enter valid amounts");
            return;
        }
        if (parseFloat(collateralAmount) < parseFloat(loanAmount) * 0.1) {
            toast.error("Collateral must be at least 10% of loan amount");
            return;
        }
        console.log("The list of lenders available are:", lenderList)
        const availableLenders = lenderList.filter(lender => lender.address.toLowerCase() !== currentAccount.toLowerCase());
        if (availableLenders.length === 0) {
            toast.error("No other lenders available");
            return;
        }
        if (parseFloat(poolBalance) < parseFloat(loanAmount)) {
            toast.error("Insufficient funds in the lending pool");
            return;
        }
        setShowLenderModal(true);
    };

    // Request a loan with selected lender
    const requestLoan = async () => {
        if (!selectedLender) {
            toast.error("Please select a lender");
            return;
        }
        if (selectedLender.toLowerCase() === currentAccount.toLowerCase()) {
            toast.error("Cannot request a loan from yourself");
            return;
        }
        try {
            setIsLoading(true);
            const tx = await contract.requestLoan(
                ethers.parseEther(loanAmount),
                selectedLender,
                { value: ethers.parseEther(collateralAmount), gasLimit: 500000 }
            );
            toast.info("Transaction submitted. Waiting for confirmation...");
            await tx.wait();
            toast.success("Loan requested successfully!");
            setLoanAmount('');
            setCollateralAmount('');
            setSelectedLender('');
            setShowLenderModal(false);
            await refreshData();
        } catch (error) {
            console.error("Error in loan process:", error);
            toast.error(error.reason || "Failed to process loan");
        } finally {
            setIsLoading(false);
        }
    };

    // Fund a loan (by lender)
    // Function to calculate gas limit with buffer
    const calculateGasLimit = async (contractMethod, args = [], options = {}) => {
        try {
            if (!contract) {
                throw new Error("Contract is not initialized");
            }

            const method = contract[contractMethod];
            if (!method) {
                throw new Error(`Method ${contractMethod} not found on contract`);
            }

            // Estimate gas with arguments and options (e.g., value)
            const gasEstimate = await method.estimateGas(...args, options);
            console.log(`Gas estimate for ${contractMethod}:`, gasEstimate.toString());

            // Calculate gas limit with 20% buffer
            let gasLimit;
            if (typeof gasEstimate === 'bigint') {
                gasLimit = gasEstimate * 120n / 100n;
            } else if (typeof gasEstimate.mul === 'function') {
                gasLimit = gasEstimate.mul(120).div(100);
            } else {
                gasLimit = Math.floor(Number(gasEstimate) * 1.2);
            }

            console.log(`Gas limit for ${contractMethod}:`, gasLimit.toString());
            return gasLimit;
        } catch (error) {
            console.error(`Error calculating gas for ${contractMethod}:`, error);
            // Simulate call to get revert reason
            try {
                await contract.callStatic[contractMethod](...args, options);
            } catch (staticError) {
                console.error(`Static call error for ${contractMethod}:`, staticError);
            }
            return 300000; // Default gas limit
        }
    };

    const fundLoan = async (borrowerAddress, requestedAmount) => {
        try {
            console.log("This is inside Fund Loan:");
            if (!contract) {
                throw new Error("Contract is not initialized");
            }

            setIsLoading(true);

            // Debug contract and ABI
            console.log("Contract address:", contract.address);
            console.log("Contract ABI functions:", contract.interface.fragments
                .filter(f => f.type === "function")
                .map(f => f.name));

            // Validate inputs
            if (!ethers.isAddress(borrowerAddress)) {
                toast.error("Invalid borrower address");
                return;
            }
            if (isNaN(parseFloat(requestedAmount)) || parseFloat(requestedAmount) <= 0) {
                toast.error("Invalid requested amount");
                return;
            }

            // Check account balance
            const balance = await provider.getBalance(currentAccount);
            console.log("Account balance in ETH:", ethers.formatEther(balance));

            // Parse the requested amount
            const requestedAmt = ethers.parseEther(requestedAmount);
            console.log("Requested Amount in ETH:", requestedAmt.toString());

            if (balance < requestedAmt + ethers.parseEther("0.01")) { // Buffer for gas
                toast.error("Insufficient ETH balance for transaction");
                return;
            }

            // Check lender's contribution
            const contribution = await contract.lenderContributions(currentAccount);
            console.log("Lender contribution in ETH:", ethers.formatEther(contribution));
            if (requestedAmt > contribution) {
                toast.error("Insufficient funds in your lending contribution");
                return;
            }

            console.log("Borrower Address:", borrowerAddress);
            console.log("Requested Amount:", requestedAmount);

            // Calculate gas limit
            const gasLimit = await calculateGasLimit('fundLoan', [borrowerAddress], { value: requestedAmt });

            // Send the fundLoan transaction
            const tx = await contract.fundLoan(borrowerAddress, {
                gasLimit,
                value: requestedAmt
            });
            toast.info("Transaction submitted. Waiting for confirmation...");

            // Wait for the transaction receipt
            const receipt = await tx.wait();
            console.log("FundLoan transaction receipt:", receipt);
            console.log("Gas used:", receipt.gasUsed.toString());

            // Update borrower balance and refresh data
            await getAccountBalance(borrowerAddress, provider);
            await refreshData();
            toast.success(`Loan funded successfully! ${requestedAmount} ETH sent to ${formatAddress(borrowerAddress)}`);
        } catch (error) {
            console.error("Error funding loan:", error);
            if (error.code === 4001) {
                toast.error("Transaction rejected by user");
            } else if (error.code === -32603) {
                toast.error("Transaction failed: " + (error.message || "Internal JSON-RPC error"));
            } else {
                toast.error(error.reason || "Failed to fund loan");
            }
        } finally {
            setIsLoading(false);
        }
    };


    // Cancel loan request
    const cancelLoan = async () => {
        try {
            setIsLoading(true);
            const tx = await contract.cancelLoan({ gasLimit: 200000 });
            toast.info("Transaction submitted. Waiting for confirmation...");
            await tx.wait();
            await refreshData();
            toast.success("Loan cancelled successfully!");
        } catch (error) {
            console.error("Error cancelling loan:", error);
            toast.error(error.reason || "Failed to cancel loan");
        } finally {
            setIsLoading(false);
        }
    };

    // Function to safely call contract methods
    const callContractMethod = async (methodName, args = [], options = {}) => {
        if (!contract) {
            throw new Error("Contract is not initialized");
        }
        console.log(methodName)

        // Check if method exists
        if (!contract[methodName]) {
            throw new Error(`Method ${methodName} not found on contract`);
        }
        console.log("Ethers version:", ethers.version);
        // Estimate gas with default value in case of failure
        let gasLimit = 300000; // Default gas limit as fallback
        try {
            // Try to estimate gas
            const gasEstimate = await contract.estimateGas[methodName](...args, options);
            console.log(`Gas estimate for ${methodName}:`, gasEstimate.toString());

            // Calculate gas limit with 20% buffer
            if (typeof gasEstimate === 'bigint') {
                // For ethers v6
                gasLimit = gasEstimate * 120n / 100n;
            } else if (typeof gasEstimate.mul === 'function') {
                // For ethers v5 with BigNumber objects
                gasLimit = gasEstimate.mul(120).div(100);
            } else {
                // Fallback for number type
                gasLimit = Math.floor(Number(gasEstimate) * 1.2);
            }
        } catch (error) {
            console.warn(`Failed to estimate gas for ${methodName}:`, error);
            // Continue with default gas limit
        }

        // Include the calculated gas limit in options
        const txOptions = {
            ...options,
            gasLimit
        };

        // Call the contract method
        return await contract[methodName](...args, txOptions);
    };

    const liquidateCollateral = async (borrowerAddress) => {
        try {
            console.log("This is inside Liquidate Collateral:");
            if (!contract) {
                throw new Error("Contract is not initialized");
            }

            setIsLoading(true);

            // Debug contract and ABI
            console.log("Contract address:", contract.address);
            console.log("Contract ABI functions:", contract.interface.fragments
                .filter(f => f.type === "function")
                .map(f => f.name));

            // Validate inputs
            if (!ethers.isAddress(borrowerAddress)) {
                toast.error("Invalid borrower address");
                return;
            }

            // Get connected account via MetaMask
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const sender = accounts[0];
            console.log("Connected wallet (msg.sender):", sender);

            // Check account balance for gas
            const balance = await provider.getBalance(sender);
            console.log("Account balance in ETH:", ethers.formatEther(balance));
            if (balance < ethers.parseEther("0.01")) { // Buffer for gas
                toast.error("Insufficient ETH balance for gas");
                return;
            }

            // Fetch loan details from the smart contract
            const loan = await contract.loans(borrowerAddress);
            console.log("Raw loan data:", loan);

            // Check if loan exists
            if (!loan || loan.borrower === ethers.ZeroAddress) {
                console.log("No loan found for borrower:", borrowerAddress);
                toast.error("No loan found for this borrower");
                return;
            }

            // Log loan details
            console.log("Loan details fetched:", {
                borrower: loan.borrower,
                lender: loan.lender,
                state: loan.state.toString(),
                date: loan.date.toString(),
                collateralAmount: ethers.formatEther(loan.collateral_amt),
                requestedAmount: ethers.formatEther(loan.requested_amt),
                repayAmount: ethers.formatEther(loan.repay_amt),
                currentTimestamp: Math.floor(Date.now() / 1000)
            });

            // Pre-transaction checks
            if (loan.lender.toLowerCase() !== sender.toLowerCase()) {
                console.log("Only the lender can liquidate this loan");
                toast.error("Only the lender can liquidate this loan");
                return;
            }
            if (loan.state.toString() !== "1") { // State.Funded = 1
                console.log("Loan is not in Funded state");
                toast.error("Loan must be in Funded state");
                return;
            }
            const currentTime = Math.floor(Date.now() / 1000);
            if (currentTime <= Number(loan.date) + 60) {
                console.log("Loan is not overdue");
                toast.error("Loan is not overdue");
                return;
            }
            if (loan.collateral_amt === 0n) {
                console.log("No collateral to liquidate");
                toast.error("No collateral to liquidate");
                return;
            }

            // Check contract balance
            const contractBalance = await provider.getBalance(contract.target);
            console.log("Contract balance:", ethers.formatEther(contractBalance));
            if (contractBalance < loan.collateral_amt) {
                console.log("Insufficient contract balance for collateral");
                toast.error("Insufficient contract balance for collateral");
                return;
            }

            // Call contract method using callContractMethod
            console.log("Calling liquidateCollateral with:", borrowerAddress);
            const tx = await callContractMethod("liquidateCollateral", [borrowerAddress]);

            console.log("Transaction sent:", tx);

            // Wait for the transaction receipt
            const receipt = await tx.wait();
            console.log("LiquidateCollateral transaction receipt:", receipt);
            console.log("Gas used:", receipt.gasUsed.toString());

            // Update borrower balance and refresh data
            await getAccountBalance(borrowerAddress, provider);
            await refreshData();
            toast.success(`Collateral liquidated successfully for ${formatAddress(borrowerAddress)}`);
        } catch (error) {
            console.error("Error liquidating collateral:", error);
            if (error.code === 4001) {
                toast.error("Transaction rejected by user");
            } else if (error.code === -32603) {
                toast.error("Transaction failed: " + (error.reason || "Internal JSON-RPC error"));
            } else {
                toast.error(error.reason || "Failed to liquidate collateral");
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Fixed repayLoan function
    const repayLoan = async (loan) => {
        try {
            setIsLoading(true);

            // Parse repay amount
            const repayAmount = ethers.parseEther(loan.repay_amt);

            // Check balance
            if (parseFloat(accountBalance) < parseFloat(loan.repay_amt)) {
                toast.error("Insufficient ETH balance to repay loan");
                return;
            }

            // Log transaction details
            console.log("Repaying loan with amount:", loan.repay_amt, "ETH");
            console.log("Current account:", currentAccount);

            // Use our helper function to call the contract method
            const tx = await callContractMethod('repayLoan', [], { value: repayAmount });

            toast.info("Transaction submitted. Waiting for confirmation...");
            await tx.wait();

            await refreshData();
            toast.success("Loan repaid successfully!");
        } catch (error) {
            console.error("Error repaying loan:", error);
            toast.error(error.reason || "Failed to repay loan");
        } finally {
            setIsLoading(false);
            setShowRepayConfirm(null);
        }
    };

    // Liquidate collateral


    // Get pool balance from contract
    const getPoolBalance = async () => {
        if (!contract) return;
        try {
            const balance = await contract.Balance();
            setPoolBalance(ethers.formatEther(balance));
        } catch (error) {
            console.error("Error getting pool balance:", error);
            await getContractBalance(provider);
            setPoolBalance(contractBalance);
        }
    };

    // Get loan details for current account
    const getLoanDetails = async (contractInstance, account) => {
        if (!contractInstance || !account) return;
        try {
            const loan = await contractInstance.loans(account);
            if (loan.borrower !== ethers.ZeroAddress) {
                setLoanDetails([{
                    borrower: loan.borrower,
                    lender: loan.lender,
                    requested_amt: ethers.formatEther(loan.requested_amt),
                    repay_amt: ethers.formatEther(loan.repay_amt),
                    interest_rate: loan.interest_rate.toString(),
                    state: loan.state.toString(),
                    date: loan.date.toString(),
                    collateral_amt: ethers.formatEther(loan.collateral_amt)
                }]);
            } else {
                setLoanDetails([]);
            }
        } catch (error) {
            console.error("Error getting loan details:", error);
            toast.error("Failed to fetch loan details");
        }
    };

    // Calculate time remaining for loan repayment
    const calculateTimeRemaining = (dateTimestamp) => {
        const dueDate = new Date(Number(dateTimestamp) * 1000 + 60 * 1000);
        const now = new Date();
        const diff = dueDate - now;

        if (diff <= 0) return "Overdue";

        const seconds = Math.floor(diff / 1000) % 60;
        const minutes = Math.floor(diff / (1000 * 60)) % 60;

        return `${minutes}m ${seconds}s`;
    };

    // Check if loan is overdue
    const isLoanOverdue = (dateTimestamp) => {
        const dueDate = new Date(Number(dateTimestamp) * 1000 + 60 * 1000);
        return new Date() > dueDate;
    };

    // Format address for display
    const formatAddress = (address) => {
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    };

    // Handle account changes
    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (newAccounts) => {
                setAccounts(newAccounts);
                const newCurrent = newAccounts[0] || '';
                setCurrentAccount(newCurrent);
                updateContractSigner(newCurrent);
                refreshData();
            });

            window.ethereum.on('chainChanged', () => {
                window.location.reload();
            });
        }
        return () => {
            if (window.ethereum) {
                window.ethereum.removeAllListeners('accountsChanged');
                window.ethereum.removeAllListeners('chainChanged');
            }
            if (contract) {
                contract.removeAllListeners();
            }
        };
    }, [contract]);

    // Refresh data on contract or account change
    useEffect(() => {
        if (contract && currentAccount) {
            refreshData();
        }
    }, [contract, currentAccount]);

    // Setup interval to update time remaining
    useEffect(() => {
        const intervalId = setInterval(() => {
            if (loanDetails.length > 0 && loanDetails.some(loan => loan.state === '1')) {
                const timeRemaining = calculateTimeRemaining(loanDetails.find(loan => loan.state === '1').date);
                if (timeRemaining === "Overdue" && !isLoading) {
                    refreshData();
                }
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [loanDetails, isLoading]);

    return (
        <div style={{ minHeight: '100vh', padding: '20px' }}>
            <div className="container">
                <h1>Lending DApp</h1>

                {!currentAccount ? (
                    <div className="card connect-wallet">
                        <h2>Connect your wallet to get started</h2>
                        <button
                            onClick={connectWallet}
                            disabled={isLoading}
                            className="btn-primary"
                        >
                            {isLoading ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    </div>
                ) : (
                    <div className="grid">
                        {/* Left Column */}
                        <div>
                            <div className="card">
                                <h2>Account Info</h2>
                                <select
                                    value={currentAccount}
                                    onChange={(e) => switchAccount(e.target.value)}
                                >
                                    {accounts.map((account) => (
                                        <option key={account} value={account}>
                                            {formatAddress(account)}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ fontSize: '14px', color: '#7f8c8d' }}>
                                    <p>Connected: {formatAddress(currentAccount)}</p>
                                    <p>ETH Balance: {parseFloat(accountBalance).toFixed(4)} ETH</p>
                                    <p style={{ fontWeight: '500' }}>
                                        Your contribution: {lenderList.find(l => l.address === currentAccount)?.contribution || '0'} ETH
                                    </p>
                                </div>
                            </div>

                            <div className="card">
                                <h2>Lending Pool</h2>
                                <div style={{ fontSize: '14px', marginBottom: '15px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                        <span>Pool Balance (tracked):</span>
                                        <span style={{ fontWeight: '500' }}>{parseFloat(poolBalance).toFixed(4)} ETH</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                        <span>Actual Contract Balance:</span>
                                        <span style={{ fontWeight: '500' }}>{parseFloat(contractBalance).toFixed(4)} ETH</span>
                                    </div>
                                    {poolBalance !== contractBalance && (
                                        <div style={{ color: '#f1c40f', fontSize: '12px', marginBottom: '15px' }}>
                                            Note: The difference between balances represents funds committed to active loans.
                                        </div>
                                    )}
                                </div>
                                <div className="card">
                                <div>
                                    <input
                                        type="number"
                                        value={fundAmount}
                                        onChange={(e) => setFundAmount(e.target.value)}
                                        placeholder="Amount in ETH"
                                        min="0"
                                        step="0.01"
                                    />
                                    <button
                                        onClick={addFund}
                                        disabled={isLoading}
                                        className="btn-success"
                                        style={{ width: '100%' }}
                                    >
                                        {isLoading ? 'Processing...' : 'Add Funds to Pool'}
                                    </button>
                                </div>
                                </div>
                            </div>

                            <div className="card">
                                <h2>Liquidate Collateral</h2>
                                <p>As a lender, you can liquidate collateral for overdue loans (after 1 minute).</p>
                                <div>
                                    <input
                                        value={borrowerAddress}
                                        onChange={(e) => setBorrowerAddress(e.target.value)}
                                        placeholder="Borrower Address"
                                    />
                                    <button
                                        onClick={() => liquidateCollateral(borrowerAddress)}
                                        disabled={isLoading || !ethers.isAddress(borrowerAddress)}
                                        className="btn-danger"
                                        style={{ width: '100%' }}
                                    >
                                        {isLoading ? 'Processing...' : 'Liquidate Collateral'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Middle Column */}
                        <div>
                            <div className="card">
                                <h2>Request a Loan</h2>
                                <p>Request a Six loan with at least 10% collateral. Your funds will be sent immediately after a lender approves your request.</p>
                                <div>
                                    <input
                                        type="number"
                                        value={loanAmount}
                                        onChange={(e) => setLoanAmount(e.target.value)}
                                        placeholder="Loan Amount in ETH"
                                        min="0"
                                        step="0.01"
                                    />
                                    <input
                                        type="number"
                                        value={collateralAmount}
                                        onChange={(e) => setCollateralAmount(e.target.value)}
                                        placeholder="Collateral Amount in ETH (min 10%)"
                                        min="0"
                                        step="0.01"
                                    />
                                    <div style={{ fontSize: '14px', color: '#7f8c8d' }}>
                                        Interest rate: 6%
                                        {loanAmount && !isNaN(loanAmount) && (
                                            <p>You'll repay: {(parseFloat(loanAmount) * 1.06).toFixed(4)} ETH</p>
                                        )}
                                    </div>
                                    <button
                                        onClick={openLenderModal}
                                        disabled={isLoading}
                                        className="btn-primary"
                                        style={{ width: '100%' }}
                                    >
                                        {isLoading ? 'Processing...' : 'Request Loan'}
                                    </button>
                                </div>
                            </div>

                            {loanDetails.length > 0 && (
                                <div className="card">
                                    <h2>Your Loans</h2>
                                    {loanDetails.map((loan, index) => (
                                        <div key={index} style={{ marginBottom: '15px', padding: '15px', border: '1px solid #ecf0f1', borderRadius: '6px' }}>
                                            <div style={{ fontSize: '14px', color: '#34495e' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Status:</span>
                                                    <span className={
                                                        loan.state === '0' ? 'text-warning' :
                                                            loan.state === '1' ? 'text-success' :
                                                                loan.state === '2' ? 'text-primary' :
                                                                    loan.state === '3' ? 'text-danger' : 'text-muted'
                                                    }>
                                                        {['Requested', 'Funded', 'Repaid', 'Defaulted', 'Cancelled'][loan.state]}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Loan Amount:</span>
                                                    <span>{parseFloat(loan.requested_amt).toFixed(4)} ETH</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Repay Amount:</span>
                                                    <span>{parseFloat(loan.repay_amt).toFixed(4)} ETH</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Collateral:</span>
                                                    <span>{parseFloat(loan.collateral_amt).toFixed(4)} ETH</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Interest Rate:</span>
                                                    <span>{loan.interest_rate}%</span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Lender:</span>
                                                    <span>{formatAddress(loan.lender)}</span>
                                                </div>
                                                {loan.state === '1' && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span>Time Remaining:</span>
                                                        <span className={isLoanOverdue(loan.date) ? 'text-danger' : 'text-success'}>
                                                            {calculateTimeRemaining(loan.date)}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '15px' }}>
                                                {loan.state === '0' && (
                                                    <button
                                                        onClick={cancelLoan}
                                                        disabled={isLoading}
                                                        className="btn-secondary"
                                                        style={{ width: '100%' }}
                                                    >
                                                        {isLoading ? 'Processing...' : 'Cancel Loan Request'}
                                                    </button>
                                                )}
                                                {loan.state === '1' && (
                                                    <button
                                                        onClick={() => setShowRepayConfirm(loan)}
                                                        disabled={isLoading || parseFloat(accountBalance) < parseFloat(loan.repay_amt)}
                                                        className="btn-warning"
                                                        style={{ width: '100%' }}
                                                    >
                                                        {isLoading ? 'Processing...' : `Repay ${parseFloat(loan.repay_amt).toFixed(4)} ETH`}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right Column */}
                        <div>
                            <div className="card">
                                <h2>Recent Events</h2>
                                {recentEvents.length > 0 ? (
                                    <div className="recent-events">
                                        {recentEvents.map((event, index) => (
                                            <div key={index} className="event-item">
                                                <div className={
                                                    event.type.includes('Funded') ? 'text-success' :
                                                        event.type.includes('Liquidated') ? 'text-danger' :
                                                            event.type.includes('Repaid') ? 'text-primary' : 'text-muted'
                                                }>
                                                    {event.type}
                                                </div>
                                                <div style={{ fontSize: '12px', color: '#7f8c8d', marginTop: '5px' }}>
                                                    {event.borrower !== ethers.ZeroAddress && (
                                                        <div>Borrower: {formatAddress(event.borrower)}</div>
                                                    )}
                                                    {event.lender !== ethers.ZeroAddress && (
                                                        <div>Lender: {formatAddress(event.lender)}</div>
                                                    )}
                                                    <div>Amount: {parseFloat(event.amount).toFixed(4)} ETH</div>
                                                    <div style={{ color: '#95a5a6', marginTop: '5px' }}>
                                                        {event.timestamp}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No recent events.</p>
                                )}
                            </div>

                            <div className="card">
                                <h2>Available Lenders</h2>
                                {lenderList.length > 0 ? (
                                    <div>
                                        {lenderList.map((lender) => (
                                            <div key={lender.address} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', borderBottom: '1px solid #ecf0f1', paddingBottom: '10px', marginBottom: '10px' }}>
                                                <span>{formatAddress(lender.address)}</span>
                                                <span>{parseFloat(lender.contribution).toFixed(4)} ETH</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p>No lenders available.</p>
                                )}
                            </div>

                            <div className="card">
                                <h2>Loan Requests</h2>
                                {loansList.filter(loan => loan.state === '0' && loan.lender.toLowerCase() === currentAccount.toLowerCase()).length > 0 ? (
                                    <div>
                                        {loansList
                                            .filter(loan => loan.state === '0' && loan.lender.toLowerCase() === currentAccount.toLowerCase())
                                            .map((loan, index) => (
                                                <div key={index} style={{ padding: '15px', border: '1px solid #ecf0f1', borderRadius: '6px', marginBottom: '15px' }}>
                                                    <div style={{ fontSize: '14px', color: '#34495e' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Borrower:</span>
                                                            <span>{formatAddress(loan.borrower)}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Loan Amount:</span>
                                                            <span>{parseFloat(loan.requested_amt).toFixed(4)} ETH</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Collateral:</span>
                                                            <span>{parseFloat(loan.collateral_amt).toFixed(4)} ETH</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                            <span>Interest:</span>
                                                            <span>{loan.interest_rate}%</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => fundLoan(loan.borrower, loan.requested_amt)}
                                                        disabled={isLoading}
                                                        className="btn-success"
                                                        style={{ width: '100%', marginTop: '10px' }}
                                                    >
                                                        {isLoading ? 'Processing...' : 'Approve Loan'}
                                                    </button>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <p>No pending loan requests for you.</p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Lender Selection Modal */}
                {showLenderModal && (
                    <div className="modal">
                        <div className="modal-content">
                            <h3>Select a Lender</h3>
                            <p>Choose a lender to request your loan from. You'll need to wait for them to fund your loan after your request is approved.</p>
                            <select
                                value={selectedLender}
                                onChange={(e) => setSelectedLender(e.target.value)}
                            >
                                <option value="">Select a lender</option>
                                {lenderList
                                    .filter(lender => lender.address.toLowerCase() !== currentAccount.toLowerCase())
                                    .map((lender) => (
                                        <option key={lender.address} value={lender.address}>
                                            {formatAddress(lender.address)} ({parseFloat(lender.contribution).toFixed(4)} ETH)
                                        </option>
                                    ))}
                            </select>
                            <div className="modal-buttons">
                                <button
                                    onClick={requestLoan}
                                    disabled={isLoading || !selectedLender}
                                    className="btn-primary"
                                    style={{ flex: 1 }}
                                >
                                    {isLoading ? 'Processing...' : 'Confirm Request'}
                                </button>
                                <button
                                    onClick={() => {
                                        setSelectedLender('');
                                        setShowLenderModal(false);
                                    }}
                                    className="btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Repay Confirmation Modal */}
                {showRepayConfirm && (
                    <div className="modal">
                        <div className="modal-content">
                            <h3>Confirm Loan Repayment</h3>
                            <p>
                                You are about to repay {parseFloat(showRepayConfirm.repay_amt).toFixed(4)} ETH for your loan.
                                Please confirm to proceed.
                            </p>
                            <div className="modal-buttons">
                                <button
                                    onClick={() => repayLoan(showRepayConfirm)}
                                    disabled={isLoading}
                                    className="btn-warning"
                                    style={{ flex: 1 }}
                                >
                                    {isLoading ? 'Processing...' : 'Confirm Repayment'}
                                </button>
                                <button
                                    onClick={() => setShowRepayConfirm(null)}
                                    className="btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Information Panel */}
                <div className="info-panel">
                    <h3>How This DApp Works</h3>
                    <ul>
                        <li>Lenders can add funds to the lending pool</li>
                        <li>Borrowers request loans and provide collateral (minimum 10%)</li>
                        <li>Loans have a fixed 6% interest rate</li>
                        <li>Loans must be repaid within 1 minute (for demo purposes)</li>
                        <li>If a loan is not repaid on time, the lender can liquidate the collateral</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default App;