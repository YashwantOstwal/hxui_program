use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Voter {
    voter:Pubkey,
    votes:u64
}
#[account]
#[derive(InitSpace)]
pub struct CandidateVoters{
    #[max_len(0)]
    pub voters:Vec<Voter>,
    pub bump:u8,
}