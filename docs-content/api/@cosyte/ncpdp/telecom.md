# @cosyte/ncpdp/telecom

`@cosyte/ncpdp/telecom`: NCPDP Telecommunication-standard (vD.0) claim parsing.
The zero-dependency claim side. Reading: validates the FS/GS/RS
control-character framing, decodes the fixed request or response Transaction
Header, tokenizes the field-id-keyed variable segments, and lifts the B1/B2/B3
request view, the response adjudication (status, pricing, DUR), and the
request-side depth (compound, coordination of benefits, DUR, prior
authorization). Emitting: serializes a transaction back to spec-clean wire form
and builds one from scratch. Liberal on parse (quirks become stable-coded
warnings with byte-offset context); only structurally unrecoverable input throws
a Telecom fatal. Conservative on emit.

## References

### adjudication

Re-exports [adjudication](../ncpdp.md#adjudication)

***

### buildTelecomRequest

Re-exports [buildTelecomRequest](../ncpdp.md#buildtelecomrequest)

***

### claim

Re-exports [claim](../ncpdp.md#claim)

***

### claimView

Re-exports [claimView](../ncpdp.md#claimview)

***

### cobOtherPayments

Re-exports [cobOtherPayments](../ncpdp.md#cobotherpayments)

***

### collectCobWarnings

Re-exports [collectCobWarnings](../ncpdp.md#collectcobwarnings)

***

### collectCompoundWarnings

Re-exports [collectCompoundWarnings](../ncpdp.md#collectcompoundwarnings)

***

### collectDurWarnings

Re-exports [collectDurWarnings](../ncpdp.md#collectdurwarnings)

***

### collectResponseWarnings

Re-exports [collectResponseWarnings](../ncpdp.md#collectresponsewarnings)

***

### compound

Re-exports [compound](../ncpdp.md#compound)

***

### D0\_HEADER\_LENGTH

Re-exports [D0_HEADER_LENGTH](../ncpdp.md#d0_header_length)

***

### decodeD0Header

Re-exports [decodeD0Header](../ncpdp.md#decoded0header)

***

### decodeResponseHeader

Re-exports [decodeResponseHeader](../ncpdp.md#decoderesponseheader)

***

### detectVersion

Re-exports [detectVersion](../ncpdp.md#detectversion)

***

### Disposition

Re-exports [Disposition](../ncpdp.md#disposition-2)

***

### DUR\_REASON\_MEANINGS

Re-exports [DUR_REASON_MEANINGS](../ncpdp.md#dur_reason_meanings)

***

### FIELD\_NAMES

Re-exports [FIELD_NAMES](../ncpdp.md#field_names)

***

### FIELD\_SEPARATOR

Re-exports [FIELD_SEPARATOR](../ncpdp.md#field_separator)

***

### fieldValue

Re-exports [fieldValue](../ncpdp.md#fieldvalue)

***

### fieldValues

Re-exports [fieldValues](../ncpdp.md#fieldvalues)

***

### findSegment

Re-exports [findSegment](../ncpdp.md#findsegment)

***

### GROUP\_SEPARATOR

Re-exports [GROUP_SEPARATOR](../ncpdp.md#group_separator)

***

### impliedThreeDecimal

Re-exports [impliedThreeDecimal](../ncpdp.md#impliedthreedecimal)

***

### NcpdpTelecomBuildError

Re-exports [NcpdpTelecomBuildError](../ncpdp.md#ncpdptelecombuilderror)

***

### NcpdpTelecomParseError

Re-exports [NcpdpTelecomParseError](../ncpdp.md#ncpdptelecomparseerror)

***

### NcpdpTelecomWarning

Re-exports [NcpdpTelecomWarning](../ncpdp.md#ncpdptelecomwarning)

***

### parseTelecom

Re-exports [parseTelecom](../ncpdp.md#parsetelecom)

***

### priorAuthorization

Re-exports [priorAuthorization](../ncpdp.md#priorauthorization)

***

### requestDur

Re-exports [requestDur](../ncpdp.md#requestdur)

***

### RESPONSE\_HEADER\_MIN\_LENGTH

Re-exports [RESPONSE_HEADER_MIN_LENGTH](../ncpdp.md#response_header_min_length)

***

### RESPONSE\_STATUS\_MEANINGS

Re-exports [RESPONSE_STATUS_MEANINGS](../ncpdp.md#response_status_meanings)

***

### responseCob

Re-exports [responseCob](../ncpdp.md#responsecob)

***

### responseDur

Re-exports [responseDur](../ncpdp.md#responsedur)

***

### responsePricing

Re-exports [responsePricing](../ncpdp.md#responsepricing)

***

### responseStatus

Re-exports [responseStatus](../ncpdp.md#responsestatus)

***

### SEGMENT\_ABSENCES

Re-exports [SEGMENT_ABSENCES](../ncpdp.md#segment_absences)

***

### SEGMENT\_CODE\_RANGES

Re-exports [SEGMENT_CODE_RANGES](../ncpdp.md#segment_code_ranges)

***

### SEGMENT\_ID\_LENGTH

Re-exports [SEGMENT_ID_LENGTH](../ncpdp.md#segment_id_length)

***

### SEGMENT\_NAMES

Re-exports [SEGMENT_NAMES](../ncpdp.md#segment_names)

***

### SEGMENT\_SEPARATOR

Re-exports [SEGMENT_SEPARATOR](../ncpdp.md#segment_separator)

***

### SegmentAbsence

Re-exports [SegmentAbsence](../ncpdp.md#segmentabsence)

***

### SegmentAbsenceReason

Re-exports [SegmentAbsenceReason](../ncpdp.md#segmentabsencereason-1)

***

### SegmentCodeRange

Re-exports [SegmentCodeRange](../ncpdp.md#segmentcoderange)

***

### SegmentGroup

Re-exports [SegmentGroup](../ncpdp.md#segmentgroup)

***

### serializeTelecom

Re-exports [serializeTelecom](../ncpdp.md#serializetelecom)

***

### splitWithOffsets

Re-exports [splitWithOffsets](../ncpdp.md#splitwithoffsets)

***

### TELECOM\_BUILD\_CODES

Re-exports [TELECOM_BUILD_CODES](../ncpdp.md#telecom_build_codes)

***

### TELECOM\_BUILD\_MESSAGES

Re-exports [TELECOM_BUILD_MESSAGES](../ncpdp.md#telecom_build_messages)

***

### TELECOM\_FATAL\_CODES

Re-exports [TELECOM_FATAL_CODES](../ncpdp.md#telecom_fatal_codes)

***

### TELECOM\_FATAL\_MESSAGES

Re-exports [TELECOM_FATAL_MESSAGES](../ncpdp.md#telecom_fatal_messages)

***

### TELECOM\_WARNING\_CODES

Re-exports [TELECOM_WARNING_CODES](../ncpdp.md#telecom_warning_codes)

***

### TELECOM\_WARNING\_MESSAGES

Re-exports [TELECOM_WARNING_MESSAGES](../ncpdp.md#telecom_warning_messages)

***

### TelecomAdjudication

Re-exports [TelecomAdjudication](../ncpdp.md#telecomadjudication)

***

### TelecomBuildCode

Re-exports [TelecomBuildCode](../ncpdp.md#telecombuildcode)

***

### TelecomClaim

Re-exports [TelecomClaim](../ncpdp.md#telecomclaim)

***

### TelecomCompound

Re-exports [TelecomCompound](../ncpdp.md#telecomcompound)

***

### TelecomCompoundIngredient

Re-exports [TelecomCompoundIngredient](../ncpdp.md#telecomcompoundingredient)

***

### TelecomDecodedTransaction

Re-exports [TelecomDecodedTransaction](../ncpdp.md#telecomdecodedtransaction)

***

### TelecomDecodedTransmission

Re-exports [TelecomDecodedTransmission](../ncpdp.md#telecomdecodedtransmission)

***

### TelecomDurAlert

Re-exports [TelecomDurAlert](../ncpdp.md#telecomduralert)

***

### TelecomDurRequest

Re-exports [TelecomDurRequest](../ncpdp.md#telecomdurrequest)

***

### TelecomFatalCode

Re-exports [TelecomFatalCode](../ncpdp.md#telecomfatalcode)

***

### TelecomField

Re-exports [TelecomField](../ncpdp.md#telecomfield)

***

### TelecomFieldInput

Re-exports [TelecomFieldInput](../ncpdp.md#telecomfieldinput)

***

### TelecomHeader

Re-exports [TelecomHeader](../ncpdp.md#telecomheader)

***

### TelecomHeaderInput

Re-exports [TelecomHeaderInput](../ncpdp.md#telecomheaderinput)

***

### telecomMoney

Re-exports [telecomMoney](../ncpdp.md#telecommoney-1)

***

### TelecomMoney

Re-exports [TelecomMoney](../ncpdp.md#telecommoney)

***

### TelecomOtherPayer

Re-exports [TelecomOtherPayer](../ncpdp.md#telecomotherpayer)

***

### TelecomOtherPayerAmount

Re-exports [TelecomOtherPayerAmount](../ncpdp.md#telecomotherpayeramount)

***

### TelecomParseOptions

Re-exports [TelecomParseOptions](../ncpdp.md#telecomparseoptions)

***

### telecomPosition

Re-exports [telecomPosition](../ncpdp.md#telecomposition-1)

***

### TelecomPosition

Re-exports [TelecomPosition](../ncpdp.md#telecomposition)

***

### TelecomPricing

Re-exports [TelecomPricing](../ncpdp.md#telecompricing)

***

### TelecomPriorAuthorization

Re-exports [TelecomPriorAuthorization](../ncpdp.md#telecompriorauthorization)

***

### TelecomProductCode

Re-exports [TelecomProductCode](../ncpdp.md#telecomproductcode)

***

### telecomQuantity

Re-exports [telecomQuantity](../ncpdp.md#telecomquantity-1)

***

### TelecomQuantity

Re-exports [TelecomQuantity](../ncpdp.md#telecomquantity)

***

### TelecomRejectCode

Re-exports [TelecomRejectCode](../ncpdp.md#telecomrejectcode)

***

### TelecomRequestInput

Re-exports [TelecomRequestInput](../ncpdp.md#telecomrequestinput)

***

### TelecomResponseHeader

Re-exports [TelecomResponseHeader](../ncpdp.md#telecomresponseheader)

***

### TelecomResponseOtherPayer

Re-exports [TelecomResponseOtherPayer](../ncpdp.md#telecomresponseotherpayer)

***

### TelecomResponseStatus

Re-exports [TelecomResponseStatus](../ncpdp.md#telecomresponsestatus)

***

### TelecomSegment

Re-exports [TelecomSegment](../ncpdp.md#telecomsegment)

***

### TelecomSegmentInput

Re-exports [TelecomSegmentInput](../ncpdp.md#telecomsegmentinput)

***

### TelecomTransaction

Re-exports [TelecomTransaction](../ncpdp.md#telecomtransaction)

***

### TelecomVersion

Re-exports [TelecomVersion](../ncpdp.md#telecomversion)

***

### telecomWarning

Re-exports [telecomWarning](../ncpdp.md#telecomwarning)

***

### TelecomWarningCode

Re-exports [TelecomWarningCode](../ncpdp.md#telecomwarningcode)

***

### tokenizeBody

Re-exports [tokenizeBody](../ncpdp.md#tokenizebody)

***

### tokenizeTransactions

Re-exports [tokenizeTransactions](../ncpdp.md#tokenizetransactions)

***

### tokenizeTransmission

Re-exports [tokenizeTransmission](../ncpdp.md#tokenizetransmission)

***

### undecodedHeader

Re-exports [undecodedHeader](../ncpdp.md#undecodedheader)
