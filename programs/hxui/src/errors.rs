use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {
    #[msg("The drop time must be set in the future.")]
    InvalidDropTime,

    #[msg("A winner can only be drawn after the scheduled draw time has passed.")]
    DrawTimeNotReached,

    #[msg("Draw winner for current cycle before setting a new drop time.")]
    PendingWinnerDraw,


    #[msg("Maximum tokens have already been minted. Please try again after the free mint cooldown.")]
    MintCooldownActive,


    #[msg("Candidate name should be less than or equal to 32 characters")]
    NameTooLong,

    #[msg("Candidate description should be less than or equal to 32 characters")]
    DescriptionTooLong,

    #[msg("Not Enough funds in the vault to afford this transfer.")]
    InsufficientFunds,

    #[msg("Token price economically does not make sense.")]
    TokenPriceNotSufficient,

    #[msg("Only admin can invoke this instruction")]
    OnlyAdminAccess,

    #[msg("This candidate is already a winner.")]
    CandidateAlreadyAWinner,

    #[msg("Only active candidates can be voted.")]
    CandidateIsNoLongerVotable,

    #[msg("The registration fees can only be claimed free mint cooldown.")]
    UnclaimableYet,

    #[msg("User have already unregistered.")]
    AlreadyUnregistered,

    #[msg("UnregisteredFreeTokens.")]
    UnregisteredForFreeTokens,

    #[msg("Only one winner can be drawn in each cycle. set a new drop time and draw a winer after the drop time.")]
    WinnerForCurrentPollAlreadyDrawn,

    #[msg("Not unregistered")]
    UnregisterFirst,

    #[msg("Rate limit exceeded for maximum free mints per epoch")]
    AllFreeTokensForTheDayMinted,

    #[msg("Received an invalid candidate.")]
    InvalidCandidate,

    #[msg("One or more active candidates are missing.")]
    MissingCandidate,

    #[msg("Pass all the active candidates mentioned in the drop time account.")]
    PassAllActiveCandidates,

    #[msg("There are no candidates to pick winner from.")]
    NoCandidates,

    #[msg("Close all the receipts first otherwise you will lose your money.")]
    CloseAllReceiptAccount,

    #[msg("Cannot close Non active candidate.")]
    ActiveCandidateCannotBeClosed,

    #[msg("The component is either claimable or withdrawn. Considering opening withdraw window first")]
    OpenWithdrawWindowFirst,

    #[msg("This component can be closed immediately by clearing all the receipts.")]
    CanBeClosedImmediatelyByClearingReceipts,

        #[msg("This component can be closed immediately without the withdraw window as there are 0 receipts.")]
    CanBeClosedImmediatelyWithoutWithdrawWindow,

    #[msg("Tokens cannot be claimed while the candidate is active or is a winner without claim back offer..")]
    TokensCannotBeClaimed,

    #[msg("Close time should be greater than the current time.")]
    InvalidClosetime,

    #[msg("Mismatch in candidate and its receipt.")]
    InvalidReceiptForCandidate,

    #[msg("Only active candidate can be voted.")]
    OnlyActiveCandidateCanBeVoted,


    #[msg("Only active candidate can be withdrawn.")]
    OnlyActiveCandidateCanBeWithdrawn,

    #[msg("Receipts cannot be closed for an active candidate.")]
    ReceiptsCannotBeClosedForAnActiveCandidate,

    #[msg("Votes must be greater than zero.")]
    VotesMustBeGreaterThan0,

    #[msg("Tokens cannot be claimed now. Either the withdraw window is yet to open or closed.")]
    UnclaimableNow,

    #[msg("Wait until the withdraw window is closed.")]
    WaitUntilWithdrawWindowIsClosed,

    #[msg("Active candidate cannot open a withdraw window.")]
    ActiveCandidateCannotOpenWithdrawWindow,

    #[msg("Cannot set claimable for non active candidate.")]
    CannotSetClaimableForNonActiveCandidate,

    #[msg("HxuiCandidate must have atleast 10 votes to be a winner.")]
    NotEnoughVotesForWinner

}


// use anchor_lang::prelude::*;

// #[error_code]
// pub enum CustomError {
//     #[msg("The drop time must be set in the future.")]
//     InvalidDropTime,

//     #[msg("A winner can only be drawn after the scheduled draw time has passed.")]
//     DrawTimeNotReached,

//     #[msg("You must draw a winner for the current cycle before setting a new drop time.")]
//     PendingWinnerDraw,

//     #[msg("Maximum tokens have already been minted. Please try again after the free mint cooldown.")]
//     MintCooldownActive,

//     #[msg("The candidate's name exceeds the maximum length of 32 characters.")]
//     CandidateNameTooLong,

//     #[msg("The candidate's description exceeds the maximum length of 32 characters.")]
//     CandidateDescriptionTooLong,

//     #[msg("The vault has insufficient funds to complete this transfer.")]
//     VaultInsufficientFunds,

//     #[msg("The specified token price is economically invalid.")]
//     InvalidTokenPrice,

//     #[msg("Unauthorized: Only an administrator can invoke this instruction.")]
//     UnauthorizedAdminAccess,

//     #[msg("This candidate has already been selected as a winner.")]
//     DuplicateWinner,

//     #[msg("Votes can only be cast for active candidates.")]
//     InactiveCandidateVoted,

//     #[msg("Registration fees can only be claimed after the free mint cooldown period.")]
//     FeeClaimCooldownActive,

//     #[msg("This user has already unregistered.")]
//     UserAlreadyUnregistered,

//     #[msg("The user is not registered for free tokens.")]
//     NotRegisteredForFreeTokens,

//     #[msg("A winner for the current cycle has already been drawn. Set a new drop time first.")]
//     CycleWinnerAlreadyDrawn,

//     #[msg("You must unregister before performing this action.")]
//     MustUnregisterFirst,

//     #[msg("The daily rate limit for free mints has been exceeded.")]
//     DailyFreeMintLimitExceeded,

//     #[msg("The provided candidate is invalid or does not exist.")]
//     InvalidCandidate,

//     #[msg("One or more required active candidates are missing from the input.")]
//     ActiveCandidatesMissing,

//     #[msg("You must provide all active candidates listed in the drop time account.")]
//     IncompleteActiveCandidateList,

//     #[msg("There are currently no valid candidates to choose a winner from.")]
//     EmptyCandidatePool,

//     #[msg("You must close all receipt accounts first to prevent loss of funds.")]
//     PendingReceiptsExist,

//     #[msg("An active candidate cannot be closed.")]
//     CannotCloseActiveCandidate,

//     #[msg("The withdrawal window must be opened before claiming or withdrawing.")]
//     WithdrawWindowNotOpen,

//     #[msg("Clear all receipts to immediately close this component.")]
//     RequiresReceiptClearance,

//     #[msg("This component has zero receipts and can be closed immediately without a withdrawal window.")]
//     ZeroReceiptsImmediateClose,

//     #[msg("Tokens cannot be claimed while the candidate is active or has won without a claim-back offer.")]
//     IneligibleForTokenClaim,

//     #[msg("The close time must be set to a future timestamp.")]
//     CloseTimeNotInFuture,

//     #[msg("The provided receipt does not match the specified candidate.")]
//     ReceiptCandidateMismatch,

//     #[msg("Withdrawals are only permitted for active candidates.")]
//     InactiveCandidateWithdrawal,

//     #[msg("Receipt accounts cannot be closed while the candidate is still active.")]
//     CannotCloseActiveReceipts,

//     #[msg("The vote amount must be greater than zero.")]
//     ZeroVotesProvided,

//     #[msg("Tokens cannot be claimed at this time. The withdrawal window is either closed or has not yet opened.")]
//     OutsideWithdrawalWindow,

//     #[msg("You must wait until the current withdrawal window has closed.")]
//     WithdrawalWindowStillOpen,

//     #[msg("An active candidate is not permitted to open a withdrawal window.")]
//     ActiveCandidateWithdrawalBlocked,

//     #[msg("Claimable status cannot be set for a non-active candidate.")]
//     InactiveCandidateClaimBlocked,

//     #[msg("A candidate must have at least 10 votes to be eligible to win.")]
//     InsufficientVotesForWinner,
// }