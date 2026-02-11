use anchor_lang::prelude::*;

#[error_code]
pub enum CustomError {
    #[msg("The deadline must be in future")]
    InvalidDeadline,

    #[msg("Cannot pick winner before the poll is ended")]
    PollIsLive,

    #[msg("Winner is not drawn for the current poll")]
    WinnerNotDrawn,

    #[msg("Only one token can be minted per 12 hours.")]
    RateLimitExceeded,

    #[msg("Name must not be greater than 32 characters")]
    NameTooLong,

    #[msg("Description must not be greater than 280 characters")]
    DescriptionTooLong,

    #[msg("Not Enough funds in the vault to afford this transfer.")]
    InsufficientFunds,

    #[msg("Token price economically does not make sense.")]
    TokenPriceNotSufficient,

    #[msg("Only admin can invoke this instruction")]
    OnlyAdminAccess,

    #[msg("The candidate is already a winner.")]
    CandidateAlreadyAWinner,

    #[msg("Candidate is already withdrawn or is a winner.")]
    CandidateIsNoLongerVotable,

    #[msg("The registration fees can be claimed only after 12 hours of unregistration.")]
    UnclaimableYet,

    #[msg("Already unregistered.")]
    AlreadyUnregistered,

    #[msg("UnregisteredFreeTokens.")]
    UnregisteredForFreeTokens,

    #[msg("Winner for current poll is already drawn.")]
    WinnerForCurrentPollAlreadyDrawn,

    #[msg("Please Unregister first before attempting to claim")]
    UnregisterFirst,

    #[msg("All 100 free tokens minted for the day.")]
    AllFreeTokensForTheDayMinted,

    #[msg("Atleast one of the candidate is not a candidate.")]
    InvalidCandidate,

    #[msg("Not all candidates have been passed.")]
    MissingCandidate,

    #[msg("There are no candidates to pick winner from.")]
    NoCandidates,

    #[msg("Close all the receipts first otherwise you will lose your money.")]
    CloseAllReceiptAccount,

    #[msg("Cannot close active componenet or their receipts. Withdraw or wait until it becomes a winner")]
    ActiveCandidateCannotBeClosed,

    #[msg("The component is either claimable or withdrawn")]
    OpenWithdrawWindowFirst,

    #[msg("This component can be closed immediately")]
    CanBeClosedImmediately,

    #[msg("Tokens cannot be claimed for this candidate")]
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
    ReceiptsCannotBeClosedForAnActiveCandidate

}
