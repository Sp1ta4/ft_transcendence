import DataValidationError from "./error/DataValidationError.js";

export default function validateSchema(data, schema) {
    const { error, value } = schema.validate(data, { abortEarly: false });

    if (error) {
        throw new DataValidationError(
            error.details.map(d => d.message)
        );
    }

    return value;
}