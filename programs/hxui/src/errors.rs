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

    #[msg("The candidate is no longer votable.")]
    CandidateIsNoLongerVotable,

    #[msg("The registration fees can be claimed only after 12 hours of unregistration.")]
    UnclaimableYet,

    #[msg("Already unregistered.")]
    AlreadyUnregistered,

    #[msg("UnregisteredFreeTokens.")]
    UnregisteredFreeTokens,

    #[msg("Winner for current poll is already drawn.")]
    WinnerForCurrentPollAlreadyDrawn,

    #[msg("Pass all the candidate.")]
    MissingCandidate
}
