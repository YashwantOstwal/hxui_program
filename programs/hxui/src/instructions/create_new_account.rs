    use anchor_lang::system_program::{CreateAccount, create_account};

use anchor_lang::prelude::*;
use crate::{ANCHOR_DISCRIMINATOR, Schema};
#[derive(Accounts)]

pub struct CreateNewAccount<'info>{
    #[account(
        mut, 
        seeds = [b"hxui_vault"], 
        bump, 
    )]
    pub vault:SystemAccount<'info>,

    /// CHECK: The validation is done while processing the ixn.
    #[account(
        mut,
        seeds = [b"hxui_new_account"],
        bump,
    )]
    pub receipt:UncheckedAccount<'info>,


    pub system_program:Program<'info,System>,
}
pub  fn create(ctx:Context<CreateNewAccount>)->Result<()>{

    let receipt = &mut ctx.accounts.receipt;
    if receipt.owner == ctx.program_id {

    let mut data = receipt.try_borrow_mut_data()?;
        
        let mut account_data: Schema = AccountDeserialize::try_deserialize(&mut &data[..])?;
        
        account_data.votes+=1;
        account_data.try_serialize(&mut &mut data[..])?;
    }else {
    // let receipt = &mut ctx.accounts.receipt;

    let pda_seeds:&[&[u8]] = &[b"hxui_new_account",&[ctx.bumps.receipt]];
    let vault_seeds:&[&[u8]] = &[b"hxui_vault",&[ctx.bumps.vault]];

    let pda_signer_seeds = [&pda_seeds[..],&vault_seeds[..]];
        let system_program = &mut ctx.accounts.system_program;
        let cpi_context = CpiContext::new(system_program.to_account_info(),CreateAccount {
            from:ctx.accounts.vault.to_account_info(),
            to:receipt.to_account_info()
        }).with_signer(&pda_signer_seeds);


        let space = ANCHOR_DISCRIMINATOR + Schema::INIT_SPACE ;
        let rent = (Rent::get()?).minimum_balance(space);
        create_account(cpi_context, rent, space as u64, &ctx.program_id)?;

         let mut data = receipt.try_borrow_mut_data()?;
    
    let state = Schema {
        id:7,votes:0 
    };

    let discriminator: &[u8] = Schema::DISCRIMINATOR;
    data[..8].copy_from_slice(&discriminator);
    state.serialize(&mut &mut data[8..])?;
    }

        Ok(())
}




pub  fn reset(ctx:Context<Temp>)->Result<()>{
    let new_account = &mut ctx.accounts.new_account;
    new_account.votes-= 0;
    Ok(())
}

#[derive(Accounts)]

pub struct Temp<'info>{
    #[account(
        mut,
        seeds = [b"hxui_new_account"],
        bump,
    )]
    pub new_account:Account<'info,Schema>,
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

