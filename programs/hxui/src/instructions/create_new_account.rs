    use anchor_lang::system_program::{CreateAccount, create_account};

use anchor_lang::prelude::*;
use crate::{Schema};
#[derive(Accounts)]

pub struct CreateNewAccount<'info>{
    #[account(
        mut, 
        seeds = [b"hxui_vault"], 
        bump, 
    )]
    pub vault:SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"hxui_new_account"],
        bump,
    )]
    pub new_account:SystemAccount<'info>,


    pub system_program:Program<'info,System>,
}
pub  fn create(ctx:Context<CreateNewAccount>)->Result<()>{
let new_account_info = ctx.accounts.new_account.to_account_info();
    let pda_seeds:&[&[u8]] = &[b"hxui_new_account",&[ctx.bumps.new_account]];
    let vault_seeds:&[&[u8]] = &[b"hxui_vault",&[ctx.bumps.vault]];

    let pda_signer_seeds = [&pda_seeds[..],&vault_seeds[..]];
        let system_program = &mut ctx.accounts.system_program;
        let cpi_context = CpiContext::new(system_program.to_account_info(),CreateAccount {
            from:ctx.accounts.vault.to_account_info(),
            to:new_account_info.clone()
        }).with_signer(&pda_signer_seeds);

        let space = 8 + Schema::INIT_SPACE ;
        let rent = (Rent::get()?).minimum_balance(space);
        create_account(cpi_context, rent, space as u64, &ctx.program_id)?;

         let mut data = new_account_info.try_borrow_mut_data()?;
    
    // Create an instance of your Schema
    let schema_data = Schema {
        id: 123, // Set your ID here
    };

    // Write the 8-byte discriminator
    let discriminator: &[u8] = Schema::DISCRIMINATOR;
    data[..8].copy_from_slice(&discriminator);

    // Serialize the struct into the remaining space (starting at index 8)
    let mut space = &mut data[8..];
    schema_data.serialize(&mut space)?;
        Ok(())
}







#[derive(Accounts)]

pub struct InitialiseNewAccount<'info>{
 #[account(
        mut)]
    pub admin:Signer<'info>,

    #[account(
        mut,
        close = admin,
        seeds = [b"hxui_new_account"],
        bump,
    )]
    pub new_account:Account<'info,Schema>,
}

