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

    #[msg("Not Enough funds in the vault to afford creation of candidate accounts and voters record.")]
    InsufficientFunds,

    #[msg("Token price economically does not make sense.")]
    TokenPriceNotSufficient
}
