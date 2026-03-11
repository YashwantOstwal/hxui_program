use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Candidate{
    pub id:u32,
    pub candidate_status:CandidateStatus,
    pub number_of_votes:u64,
    pub claimable_if_winner:bool,
    pub claim_window:i64,
    pub bump:u8,
    pub total_receipts:u64,
        #[max_len(32)]
    pub name:String,
    #[max_len(280)]
    pub description:String,

}

#[derive(AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone,InitSpace)]

pub enum CandidateStatus {
    Active,
    Withdrawn,
    Winner,
    ClaimableWinner
}