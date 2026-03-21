use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {

    #[msg("The specified timestamp must be set in the future.")]
    TimestampNotInFuture,

    #[msg("A winner can only be drawn after the scheduled draw time has passed.")]
    DrawTimeNotReached,

    #[msg("You must draw a winner for the current cycle before setting a new drop time.")]
    PendingWinnerDraw,

    #[msg("Maximum tokens have already been minted. Please try again after the free mint cooldown.")]
    MintCooldownActive,

    #[msg("The candidate's description exceeds the maximum length of 128 characters.")]
    CandidateDescriptionTooLong,

    #[msg("The vault has insufficient funds to complete this transfer.")]
    VaultInsufficientFunds,

    #[msg("The specified token price must be greater than or equal to half of Vote receipt (21 bytes) account rent.")]
    InvalidTokenPrice,

    #[msg("Unauthorized: Only an administrator can invoke this instruction.")]
    UnauthorizedAdminAccess,

    #[msg("Votes can only be cast for active candidates.")]
    InactiveCandidateVoted,

    #[msg("Registration fees can only be claimed after the free mint cooldown period.")]
    FeeClaimCooldownActive,

    #[msg("This user has already unregistered.")]
    UserAlreadyUnregistered,

    #[msg("The user is not registered for free tokens.")]
    NotRegisteredForFreeTokens,

    #[msg("A winner for the current cycle has already been drawn. Set a new drop time first.")]
    CycleWinnerAlreadyDrawn,

    #[msg("You must unregister before performing this action.")]
    MustUnregisterFirst,

    #[msg("The rate limit for free mints per epoch has been exceeded.")]
    OverallFreeMintLimitExceeded,

    #[msg("The provided candidate is an invalid candidate.")]
    InvalidCandidate,

    #[msg("You must provide all active candidates listed in the drop time account.")]
    IncompleteActiveCandidateList,

    #[msg("There are currently no valid candidates to choose a winner from.")]
    EmptyCandidatePool,

    #[msg("You must close all receipt accounts first to prevent loss of funds.")]
    PendingReceiptsExist,

    #[msg("An active candidate cannot be closed.")]
    CannotCloseActiveCandidate,

    #[msg("The claim back window must be opened before claiming.")]
    ClaimBackWindowNotOpen,

    #[msg("Clear all receipts to immediately close this component.")]
    RequiresReceiptClearance,

    #[msg("This component has zero receipts and can be closed immediately without a claim back window.")]
    ZeroReceiptsImmediateClose,

    #[msg("Tokens cannot be claimed for an active candidate or a winner candidate without claim-back offer.")]
    IneligibleForTokenClaim,

    #[msg("The provided receipt does not match the specified candidate.")]
    ReceiptCandidateMismatch,

    #[msg("Withdrawals are only permitted for active candidates.")]
    InactiveCandidateWithdrawal,

    #[msg("Receipt accounts cannot be closed while the candidate is still active.")]
    CannotCloseActiveReceipts,

    #[msg("The vote amount must be greater than zero.")]
    ZeroVotesProvided,

    #[msg("Tokens cannot be claimed at this time. The claim back window is either closed or has not yet opened.")]
    OutsideClaimBackWindow,

    #[msg("You must wait until the current claim back window has closed.")]
    ClaimBackWindowStillOpen,

    #[msg("An active candidate is not permitted to open a claim back window.")]
    ActiveCandidateClaimBackWindowBlocked,

    #[msg("Claim back offer cannot be set for a non-active candidate.")]
    InactiveCandidateClaimBlocked,

    #[msg("No candidate meets the minimum vote requirement.")]
    InsufficientVotesForWinner,
}