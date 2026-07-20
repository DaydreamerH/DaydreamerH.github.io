add_executable(26_gamma_correction main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(26_gamma_correction glfw opengl32)
endif()

foreach(FILE_NAME gamma_correction.vs gamma_correction.fs)
    add_custom_command(TARGET 26_gamma_correction POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:26_gamma_correction>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 26_gamma_correction POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/images/wall.jpg"
    "$<TARGET_FILE_DIR:26_gamma_correction>/wall.jpg"
)
