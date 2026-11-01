import{reminderFailureCode}from'./reminderDiagnostics'
it.each([
 ['ECONNREFUSED','REMINDER_DATABASE_UNAVAILABLE'],['EAI_AGAIN','REMINDER_DATABASE_UNAVAILABLE'],['57P03','REMINDER_DATABASE_UNAVAILABLE'],['ETIMEDOUT','REMINDER_DATABASE_TIMEOUT'],['57014','REMINDER_DATABASE_TIMEOUT'],['42501','REMINDER_DATABASE_ACCESS'],['28P01','REMINDER_DATABASE_ACCESS'],['42P01','REMINDER_DATABASE_SCHEMA'],['42703','REMINDER_DATABASE_SCHEMA'],['42883','REMINDER_DATABASE_SCHEMA'],['PRIVATE_CUSTOMER_TOKEN','REMINDER_RUN_FAILED'],
])('classifies %s using a fixed non-sensitive code',(code,expected)=>{
 expect(reminderFailureCode(Object.assign(new Error('secret database URL and project must not appear'),{code}))).toBe(expected)
})
it('recognizes connection-pool timeouts without returning their text',()=>{
 expect(reminderFailureCode(new Error('timeout exceeded when trying to connect to private host'))).toBe('REMINDER_DATABASE_TIMEOUT')
 expect(reminderFailureCode(new Error('Connection terminated due to connection timeout'))).toBe('REMINDER_DATABASE_TIMEOUT')
})
it('contains unknown errors and even throwing property accessors',()=>{
 for(const value of[null,'secret',new Error('PRIVATE PROJECT'),{get code(){throw new Error('private')}}])expect(reminderFailureCode(value)).toBe('REMINDER_RUN_FAILED')
})
