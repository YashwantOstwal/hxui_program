use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint,TokenAccount,Token2022,Burn,burn},
};
use crate::{Candidate, Config, CustomError};
#[derive(Accounts)]
pub struct VoteCandidate<'info>{
    #[account(mut)]
    pub owner:Signer<'info>,

    #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_token_account:InterfaceAccount<'info,TokenAccount>,

     #[account(
        mut,
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        constraint = candidate_component.is_winner == false @ CustomError::CandidateAlreadyAWinner,
        constraint = candidate_component.is_votable == true @ CustomError::CandidateIsNoLongerVotable
    )]
    pub candidate_component:Account<'info,Candidate>,

      #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,Config>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>,


}

pub fn vote(ctx:Context<VoteCandidate>,votes:u64)->Result<()>{
    ctx.accounts.candidate_component.number_of_votes += votes;

    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),Burn{
        mint:ctx.accounts.hxui_mint.to_account_info(),
        from:ctx.accounts.hxui_token_account.to_account_info(),
        authority:ctx.accounts.owner.to_account_info()
    });

    burn(cpi_context, votes * ctx.accounts.hxui_config.tokens_per_vote)
}