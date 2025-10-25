import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

function YieldGarden({ signer, arcadeTokenAddress, arcadeTokenAbi, yieldGardenAddress, yieldGardenAbi }) {
    const [balance, setBalance] = useState("0");
    const [stakedAmount, setStakedAmount] = useState("0");
    const [yieldReward, setYieldReward] = useState("0");
    const [stakeInput, setStakeInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const arcadeToken = new ethers.Contract(arcadeTokenAddress, arcadeTokenAbi, signer);
    const yieldGarden = new ethers.Contract(yieldGardenAddress, yieldGardenAbi, signer);

    const updateBalances = useCallback(async () => {
        if (signer) {
            const userAddress = await signer.getAddress();
            const bal = await arcadeToken.balanceOf(userAddress, 0);
            setBalance(ethers.formatUnits(bal, 18));

            const stakeInfo = await yieldGarden.stakes(userAddress);
            setStakedAmount(ethers.formatUnits(stakeInfo.amount, 18));

            const reward = await yieldGarden.calculateYield(userAddress);
            setYieldReward(ethers.formatUnits(reward, 18));
        }
    }, [signer, arcadeToken, yieldGarden]);

    useEffect(() => {
        updateBalances();
        const interval = setInterval(updateBalances, 5000); // Refresh every 5 seconds
        return () => clearInterval(interval);
    }, [updateBalances]);

    const handleStake = async () => {
        if (!stakeInput || parseFloat(stakeInput) <= 0) return;
        setIsLoading(true);
        try {
            const amountToStake = ethers.parseUnits(stakeInput, 18);

            // Step 1: Approve the Garden contract to spend our ARC
            const approveTx = await arcadeToken.setApprovalForAll(yieldGardenAddress, true);
            await approveTx.wait();

            // Step 2: Call the stake function
            const stakeTx = await yieldGarden.stake(amountToStake);
            await stakeTx.wait();

            setStakeInput("");
            await updateBalances();

        } catch (error) {
            console.error("Staking failed:", error);
        }
        setIsLoading(false);
    };

    const handleUnstake = async () => {
        setIsLoading(true);
        try {
            const unstakeTx = await yieldGarden.unstake();
            await unstakeTx.wait();
            await updateBalances();
        } catch (error) {
            console.error("Unstaking failed:", error);
        }
        setIsLoading(false);
    };

    return (
        <div className="game-container">
            <h2>DeFi Yield Garden</h2>
            <p>Your ARC Balance: <strong>{parseFloat(balance).toFixed(4)}</strong></p>
            <p>Staked Amount: <strong>{parseFloat(stakedAmount).toFixed(4)}</strong></p>
            <p>Pending Rewards: <strong>{parseFloat(yieldReward).toFixed(8)} ARC</strong></p>

            <hr/>

            {stakedAmount === "0.0" ? (
                <div className="stake-controls">
                    <input
                        type="number"
                        value={stakeInput}
                        onChange={(e) => setStakeInput(e.target.value)}
                        placeholder="Amount to Stake"
                    />
                    <button onClick={handleStake} disabled={isLoading}>
                        {isLoading ? "Staking..." : "Stake ARC"}
                    </button>
                </div>
            ) : (
                <button onClick={handleUnstake} disabled={isLoading}>
                    {isLoading ? "Unstaking..." : "Unstake & Claim Rewards"}
                </button>
            )}
        </div>
    );
}

export default YieldGarden;
