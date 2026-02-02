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
    RateLimitExceeded
}
