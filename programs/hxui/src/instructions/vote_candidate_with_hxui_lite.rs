use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint,TokenAccount,Token2022,Burn,burn},
};
use crate::{HxuiCandidate, CandidateStatus, HxuiConfig, CustomError};
#[derive(Accounts)]
#[instruction(name:String)]
pub struct VoteCandidateWithHxuiLite<'info>{
    pub owner:Signer<'info>,

    #[account(
        mut,
        associated_token::authority = owner,
        associated_token::mint = hxui_lite_mint,
        associated_token::token_program = token_program
    )]
    pub hxui_lite_token_account:InterfaceAccount<'info,TokenAccount>,

    #[account(
        mut,
        seeds = [b"hxui_lite_mint"],
        bump,
        mint::decimals = 0,
        mint::token_program = token_program,
    )]
    pub hxui_lite_mint:InterfaceAccount<'info,Mint>,

    #[account(
        mut,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump = hxui_candidate.bump,
        // constraint = hxui_candidate.can_be_winner == true @ CustomError::CandidateIsNoLongerVotable
        // constraint = hxui_candidate.is_winner == false @ CustomError::CandidateAlreadyAWinner,

        constraint = hxui_candidate.status == CandidateStatus::Active @ CustomError::OnlyActiveCandidateCanBeVoted,
    )]
    pub hxui_candidate:Account<'info,HxuiCandidate>,


    #[account(
        seeds = [b"hxui_config"],
        bump = hxui_config.bump,
    )]
    pub hxui_config: Account<'info,HxuiConfig>,

    pub system_program:Program<'info,System>,
    pub associated_token_program:Program<'info,AssociatedToken>,
    pub token_program:Program<'info,Token2022>,
}

pub fn vote_with_hxui_lite(ctx:Context<VoteCandidateWithHxuiLite>,votes:u64)->Result<()>{
    let candidate = &mut ctx.accounts.hxui_candidate;
    let config = & ctx.accounts.hxui_config;

    let tokens_spent = votes * config.tokens_per_vote;
    candidate.vote_count += votes;
    let cpi_context = CpiContext::new(ctx.accounts.token_program.to_account_info(),Burn{
        mint:ctx.accounts.hxui_lite_mint.to_account_info(),
        from:ctx.accounts.hxui_lite_token_account.to_account_info(),
        authority:ctx.accounts.owner.to_account_info()
    });

    burn(cpi_context,tokens_spent)
}