# @cosyte/ncpdp/script

`@cosyte/ncpdp/script`: NCPDP SCRIPT (XML ePrescribing) parsing, serialization,
and message building. Reads the routing header, the NewRx transaction (patient,
pharmacy, prescriber, prescribed medication and its structured SIG view), the
response transactions, and the prescription-lifecycle transactions. Liberal on
parse (quirks become stable-coded warnings with XPath context), with a hard
XXE/entity boundary at load time; conservative on emit.

## References

### approvalOf

Re-exports [approvalOf](../ncpdp.md#approvalof)

***

### buildNewRx

Re-exports [buildNewRx](../ncpdp.md#buildnewrx)

***

### buildScriptResponse

Re-exports [buildScriptResponse](../ncpdp.md#buildscriptresponse)

***

### cancelRx

Re-exports [cancelRx](../ncpdp.md#cancelrx-1)

***

### CancelRx

Re-exports [CancelRx](../ncpdp.md#cancelrx)

***

### cancelRxResponse

Re-exports [cancelRxResponse](../ncpdp.md#cancelrxresponse-1)

***

### CancelRxResponse

Re-exports [CancelRxResponse](../ncpdp.md#cancelrxresponse)

***

### classifyVersion

Re-exports [classifyVersion](../ncpdp.md#classifyversion)

***

### dispositionOf

Re-exports [dispositionOf](../ncpdp.md#dispositionof)

***

### DrugCoded

Re-exports [DrugCoded](../ncpdp.md#drugcoded)

***

### error

Re-exports [error](../ncpdp.md#error)

***

### ErrorBody

Re-exports [ErrorBody](../ncpdp.md#errorbody)

***

### extractStructuredSig

Re-exports [extractStructuredSig](../ncpdp.md#extractstructuredsig)

***

### KNOWN\_SCRIPT\_VERSIONS

Re-exports [KNOWN_SCRIPT_VERSIONS](../ncpdp.md#known_script_versions)

***

### KnownScriptVersion

Re-exports [KnownScriptVersion](../ncpdp.md#knownscriptversion)

***

### LifecycleRequest

Re-exports [LifecycleRequest](../ncpdp.md#lifecyclerequest)

***

### LifecycleRequestFields

Re-exports [LifecycleRequestFields](../ncpdp.md#lifecyclerequestfields)

***

### LifecycleRequestKind

Re-exports [LifecycleRequestKind](../ncpdp.md#lifecyclerequestkind)

***

### LifecycleResponse

Re-exports [LifecycleResponse](../ncpdp.md#lifecycleresponse)

***

### LifecycleResponseFields

Re-exports [LifecycleResponseFields](../ncpdp.md#lifecycleresponsefields)

***

### LifecycleResponseKind

Re-exports [LifecycleResponseKind](../ncpdp.md#lifecycleresponsekind)

***

### MedicationPrescribed

Re-exports [MedicationPrescribed](../ncpdp.md#medicationprescribed-4)

***

### newRx

Re-exports [newRx](../ncpdp.md#newrx-1)

***

### NewRx

Re-exports [NewRx](../ncpdp.md#newrx)

***

### NewRxInput

Re-exports [NewRxInput](../ncpdp.md#newrxinput)

***

### parseScript

Re-exports [parseScript](../ncpdp.md#parsescript)

***

### ParseScriptOptions

Re-exports [ParseScriptOptions](../ncpdp.md#parsescriptoptions)

***

### PartyIdentification

Re-exports [PartyIdentification](../ncpdp.md#partyidentification)

***

### Patient

Re-exports [Patient](../ncpdp.md#patient-4)

***

### Pharmacy

Re-exports [Pharmacy](../ncpdp.md#pharmacy-4)

***

### Prescriber

Re-exports [Prescriber](../ncpdp.md#prescriber-4)

***

### Quantity

Re-exports [Quantity](../ncpdp.md#quantity-1)

***

### ResponseApproval

Re-exports [ResponseApproval](../ncpdp.md#responseapproval)

***

### ResponseBody

Re-exports [ResponseBody](../ncpdp.md#responsebody)

***

### ResponseDisposition

Re-exports [ResponseDisposition](../ncpdp.md#responsedisposition)

***

### ResponseFields

Re-exports [ResponseFields](../ncpdp.md#responsefields)

***

### ResponseKind

Re-exports [ResponseKind](../ncpdp.md#responsekind)

***

### ResponseOutcome

Re-exports [ResponseOutcome](../ncpdp.md#responseoutcome)

***

### ResponseReason

Re-exports [ResponseReason](../ncpdp.md#responsereason)

***

### rxChangeRequest

Re-exports [rxChangeRequest](../ncpdp.md#rxchangerequest-1)

***

### RxChangeRequest

Re-exports [RxChangeRequest](../ncpdp.md#rxchangerequest)

***

### rxChangeResponse

Re-exports [rxChangeResponse](../ncpdp.md#rxchangeresponse-1)

***

### RxChangeResponse

Re-exports [RxChangeResponse](../ncpdp.md#rxchangeresponse)

***

### rxRenewalRequest

Re-exports [rxRenewalRequest](../ncpdp.md#rxrenewalrequest-1)

***

### RxRenewalRequest

Re-exports [RxRenewalRequest](../ncpdp.md#rxrenewalrequest)

***

### rxRenewalResponse

Re-exports [rxRenewalResponse](../ncpdp.md#rxrenewalresponse-1)

***

### RxRenewalResponse

Re-exports [RxRenewalResponse](../ncpdp.md#rxrenewalresponse)

***

### SCRIPT\_TRANSACTION\_NAMES

Re-exports [SCRIPT_TRANSACTION_NAMES](../ncpdp.md#script_transaction_names)

***

### ScriptBody

Re-exports [ScriptBody](../ncpdp.md#scriptbody)

***

### ScriptHeader

Re-exports [ScriptHeader](../ncpdp.md#scriptheader)

***

### ScriptHeaderInput

Re-exports [ScriptHeaderInput](../ncpdp.md#scriptheaderinput)

***

### ScriptMessage

Re-exports [ScriptMessage](../ncpdp.md#scriptmessage)

***

### ScriptName

Re-exports [ScriptName](../ncpdp.md#scriptname)

***

### ScriptResponseInput

Re-exports [ScriptResponseInput](../ncpdp.md#scriptresponseinput)

***

### ScriptTransactionName

Re-exports [ScriptTransactionName](../ncpdp.md#scripttransactionname)

***

### serializeScript

Re-exports [serializeScript](../ncpdp.md#serializescript)

***

### SigField

Re-exports [SigField](../ncpdp.md#sigfield)

***

### SigFieldProvenance

Re-exports [SigFieldProvenance](../ncpdp.md#sigfieldprovenance-1)

***

### status

Re-exports [status](../ncpdp.md#status)

***

### StatusBody

Re-exports [StatusBody](../ncpdp.md#statusbody)

***

### Strength

Re-exports [Strength](../ncpdp.md#strength-1)

***

### StructuredSig

Re-exports [StructuredSig](../ncpdp.md#structuredsig)

***

### UnsupportedBody

Re-exports [UnsupportedBody](../ncpdp.md#unsupportedbody)

***

### verify

Re-exports [verify](../ncpdp.md#verify)

***

### VerifyBody

Re-exports [VerifyBody](../ncpdp.md#verifybody)

***

### VersionClassification

Re-exports [VersionClassification](../ncpdp.md#versionclassification)

***

### XmlElement

Re-exports [XmlElement](../ncpdp.md#xmlelement)
