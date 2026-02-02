use anchor_lang::prelude::*;

use crate::{ANCHOR_DISCRIMINATOR, Candidate, CandidateVoters, Config, CustomError};

#[derive(Accounts)]
#[instruction(name:String)]
pub struct CreateCandidate<'info>{
    #[account(mut)] //admin funds the create candidate account, eventually you can also let the vault fund. making sure the vault can afford it. by constraint expressions,
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
        seeds = [b"hxui_candidate_component",name.as_bytes()],
        bump,
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
    // #[account(
    //     mut,
    //     seeds = [b"hxui_vault"],
    //     bump
    // )]
    // pub hxui_vault:SystemAccount<'info>,


    pub system_program:Program<'info,System>
}


pub fn initialise_candidate(ctx:Context<CreateCandidate>,name:String,description:String)->Result<()>{
    require!(name.len() <=32, CustomError::NameTooLong);
    require!(description.len() <= 280, CustomError::DescriptionTooLong);

    let candidate  = &mut ctx.accounts.hxui_candidate;
    candidate.set_inner(Candidate { name, description, number_of_votes: 0, is_winner: false, is_votable: true, bump: ctx.bumps.hxui_candidate });
    Ok(())
}
