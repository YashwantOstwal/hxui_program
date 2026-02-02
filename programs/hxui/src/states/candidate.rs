use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Candidate{
    #[max_len(32)]
    pub name:String,

    #[max_len(280)]
    pub description:String,

    pub number_of_votes:u64,
    pub is_winner:bool,
    pub is_votable:bool,
    pub bump:u8

}