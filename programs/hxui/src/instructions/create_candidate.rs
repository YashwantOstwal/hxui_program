use anchor_lang::prelude::*;

use anchor_spl::{
    token_interface::{Mint,Token2022},
};
use crate::{ANCHOR_DISCRIMINATOR, Candidate, CandidateVoters, Config, CustomError};

#[derive(Accounts)]
#[instruction(name:String,description:String)]
pub struct CreateCandidate<'info>{
    #[account(mut)]
    pub admin:Signer<'info>,

    #[account(
        has_one = admin,
        seeds = [b"hxui_config"],
        bump = hxui_config.bump
    )]
    pub hxui_config:Account<'info,Config>,

    #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + Candidate::INIT_SPACE,
        seeds = [b"hxui_candidate",name.as_bytes()],
        bump,
        constraint = description.len() <= 280 @ CustomError::DescriptionTooLong
    )]
    pub hxui_candidate:Account<'info,Candidate>,

      #[account(
        init,
        payer = admin,
        space = ANCHOR_DISCRIMINATOR + CandidateVoters::INIT_SPACE,
        seeds = [b"hxui_candidate_component_voters",name.as_bytes()],
        bump,
    )]
    pub hxui_candidate_voters:Account<'info,CandidateVoters>,   

    #[account(
        seeds = [b"hxui_mint"],
        bump,
        mint::decimals = 0,
        mint::authority = hxui_mint,
        mint::token_program = token_program
    )]
    pub hxui_mint:InterfaceAccount<'info,Mint>,

    pub system_program:Program<'info,System>,
    pub token_program:Program<'info,Token2022>,
}


pub fn initialise_candidate(ctx:Context<CreateCandidate>,name:String,description:String)->Result<()>{
    let candidate  = &mut ctx.accounts.hxui_candidate;
    candidate.set_inner(Candidate { name, description, number_of_votes: 0, is_winner: false, is_votable: true, bump: ctx.bumps.hxui_candidate });
    
    ctx.accounts.hxui_candidate_voters.bump = ctx.bumps.hxui_candidate_voters;
    Ok(())
}
